#include <iostream>
#include <algorithm>
#include <stdexcept>

#include "unistd.h"
#include "sys/types.h"

#include <zmq.h>

#include "DynaLog.hpp"
#include "FacilityServer.hpp"
#include "GSSAPI_Utils.hpp"

using namespace std;

namespace SDMS {
namespace Facility {

#define DEBUG_GSI
#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 30
#define SET_MSG_HANDLER(proto_id,name,func)  m_msg_handlers[(proto_id << 8 ) | m_conn.findMessageType( proto_id, name )] = func;

// Class ctor/dtor

Server::Server( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout, uint32_t a_num_workers ) :
    m_conn( a_server_host, a_server_port, Connection::Server ),
    m_timeout(a_timeout * 1000),
    m_router_thread(0),
    m_maint_thread(0),
    m_num_workers(a_num_workers),
    m_router_running(false),
    m_worker_running(false)
    //m_sec_cred(0)
    
{
#if 0
    if ( globus_module_activate( GLOBUS_GSI_GSSAPI_MODULE ) != GLOBUS_SUCCESS )
        throw runtime_error("failed to activate Globus GSI GSS assist module");

    OM_uint32 maj_stat, min_stat;

    maj_stat = gss_acquire_cred( &min_stat, GSS_C_NO_NAME, GSS_C_INDEFINITE, GSS_C_NO_OID_SET,
        GSS_C_INITIATE, &m_sec_cred, 0, 0 );

    if ( maj_stat != GSS_S_COMPLETE )
        throw runtime_error( "Unable to acquire valid credentials. Please (re)run grid-proxy-init." );

    #ifdef DEBUG_GSI

    gss_name_t cred_name = 0;

    if ( gss_inquire_cred( &min_stat, m_sec_cred, &cred_name, 0, 0, 0 )!= GSS_S_COMPLETE )
        throw runtime_error("failed to inquire credentials");

    gssString   name_str( cred_name );
    cout << "cred name: " << name_str << "\n";

    #endif
#endif

    uint8_t proto_id;
    SET_MSG_HANDLER(1,"StatusRequest",&Worker::procMsgStatus);
    SET_MSG_HANDLER(1,"PingRequest",&Worker::procMsgPing);

    proto_id = REG_API(m_conn,Facility);
    (void)proto_id;
    //SET_MSG_HANDLER(proto_id,"InitSecurityRequest",&Worker::procMsgInitSec);
    //SET_MSG_HANDLER(proto_id,"TermSecurityRequest",&Worker::procMsgTermSec);
    //SET_MSG_HANDLER(proto_id,"UserListRequest",&Worker::procMsgUserListReq);
}


Server::~Server()
{
    //globus_module_deactivate( GLOBUS_GSI_GSSAPI_MODULE );
}


void
Server::runWorkerRouter( bool a_async )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_router_running )
        throw runtime_error( "Only one worker router instance allowed" );

    m_router_running = true;

    if ( a_async )
    {
        m_router_thread = new thread( &Server::workerRouter, this );
        m_maint_thread = new thread( &Server::backgroundMaintenance, this );
    }
    else
    {
        lock.unlock();
        m_maint_thread = new thread( &Server::backgroundMaintenance, this );
        workerRouter();
        lock.lock();
        m_router_running = false;
        m_router_cvar.notify_all();

        m_maint_thread->join();
        delete m_maint_thread;
        m_maint_thread = 0;
    }
}


void
Server::stopWorkerRouter( bool a_async )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_router_running )
    {
        void *control = zmq_socket( m_conn.getContext(), ZMQ_PUB );

        int linger = 100;
        if ( zmq_setsockopt( control, ZMQ_LINGER, &linger, sizeof( int )) == -1 )
            throw runtime_error("zmq_setsockopt linger failed");
        if ( zmq_bind( control, "inproc://control" ) == -1 )
            throw runtime_error("zmq_bind failed");
        if ( zmq_send( control, "TERMINATE", 9, 0 ) == -1 )
            throw runtime_error("zmq_seend failed");

        if ( !a_async )
        {
            if ( m_router_thread )
            {
                m_router_thread->join();
                delete m_router_thread;

                m_router_thread = 0;
                m_router_running = false;
            }
            else
            {
                while( m_router_running )
                    m_router_cvar.wait( lock );
            }

            m_maint_thread->join();
            delete m_maint_thread;
            m_maint_thread = 0;
        }
        else
        {
            // zmq provides no way to flush buffer, just have to wait a while
            usleep( 50000 );
        }

        zmq_close( control );
    }
}


void
Server::waitWorkerRouter()
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_router_running )
    {
        if ( m_router_thread )
        {
            m_router_thread->join();
            delete m_router_thread;

            m_router_thread = 0;
            m_router_running = false;

            m_maint_thread->join();
            delete m_maint_thread;
            m_maint_thread = 0;
        }
        else
        {
            while( m_router_running )
                m_router_cvar.wait( lock );
        }
    }
}



void
Server::backgroundMaintenance()
{
    struct timespec t;
    map<uint32_t,ClientInfo>::iterator ci;

    while( m_router_running )
    {
        sleep( MAINT_POLL_INTERVAL );

        lock_guard<mutex> lock( m_data_mutex );

        clock_gettime( CLOCK_REALTIME, &t );

        for ( ci = m_client_info.begin(); ci != m_client_info.end(); )
        {
            if ( t.tv_sec - ci->second.last_act > CLIENT_IDLE_TIMEOUT )
            {
                //cout << "clean-up client " << ci->first << "\n";
#if 0
                if ( ci->second.sec_ctx )
                {
                    OM_uint32  min_stat;
                    
                    gss_delete_sec_context( &min_stat, &ci->second.sec_ctx, GSS_C_NO_BUFFER );
                }
#endif
                ci = m_client_info.erase( ci );
            }
            else
                ++ci;
        }
    }
}


#if 0
Server::ClientInfo &
Server::getClientInfo( MsgBuffer & a_msg_buffer, bool a_upd_last_act )
{
    lock_guard<mutex> lock(m_data_mutex);

    if ( a_upd_last_act )
    {
        ClientInfo &ci = m_client_info[a_msg_buffer.cid()]; 

        struct timespec t = {0,0};
        clock_gettime( CLOCK_REALTIME, &t );
        ci.last_act = t.tv_sec;

        return ci;
    }
    else
    {
        return m_client_info[a_msg_buffer.cid()];
    }
}
#endif



void
Server::dataHandler()
{
    MsgBuf msg_buf;

    map<uint16_t,msg_fun_t>::iterator handler = m_msg_handlers.find( msg_buf.getMsgType() );

    if ( handler != m_msg_handlers.end() )
        (this->*handler->second)( msg_buf );
    else
        cout << "Recv unregistered msg type: " << msg_type << "\n";

}



#define PROC_MSG_BEGIN( msgclass, replyclass ) \
    msgclass *msg = 0; \
    ::google::protobuf::Message *base_msg = a_msg_buffer->unserialize(); \
    if ( base_msg ) \
    { \
        msg = dynamic_cast<msgclass*>( base_msg ); \
        if ( msg ) \
        { \
            DL_TRACE( "Rcvd: " << msg->DebugString()); \
            (void)client;\
            replyclass reply; \
            try \
            {

#define PROC_MSG_END \
            } \
            catch( TraceException &e ) \
            { \
                DL_WARN( "worker "<<m_id<<": exception:" << e.toString() ); \
                reply.mutable_header()->set_err_code( e.getErrorCode() ); \
                reply.mutable_header()->set_err_msg( e.toString() ); \
            } \
            catch( exception &e ) \
            { \
                DL_WARN( "worker "<<m_id<<": " << e.what() ); \
                reply.mutable_header()->set_err_code( EC_INTERNAL_ERROR ); \
                reply.mutable_header()->set_err_msg( e.what() ); \
            } \
            catch(...) \
            { \
                DL_WARN( "worker "<<m_id<<": unkown exception while processing message!" ); \
                reply.mutable_header()->set_err_code( EC_INTERNAL_ERROR ); \
                reply.mutable_header()->set_err_msg( "Unknown exception type" ); \
            } \
            a_msg_buffer->serialize( reply ); \
            /*m_conn->send( a_msg_buffer );*/ \
            DL_TRACE( "Sent: " << reply.DebugString()); \
        } \
        else { \
            DL_ERROR( "worker "<<m_id<<": dynamic cast of msg buffer " << &a_msg_buffer << " failed!" );\
        } \
        delete base_msg; \
    } \
    else { \
        DL_ERROR( "worker "<<m_id<<": buffer parse failed due to unregistered msg type." ); \
    }


void
Server::procMsgStatus( MsgBuffer &a_msg_buffer )
{
    PROC_MSG_BEGIN( StatusRequest, StatusReply )

    reply.set_status( NORMAL );

    PROC_MSG_END
}


void
Server::procMsgPing( MsgBuffer & a_msg_buffer )
{
    PROC_MSG_BEGIN( PingRequest, PingReply )

    // Nothing to do

    PROC_MSG_END
}


#if 0

void
Server::procMsgUserListReq( MsgBuffer & a_msg_buffer )
{
    cout << "proc user list\n";

    PROC_MSG_BEGIN( UserListRequest, UserListReply )

    if ( client.state != CS_AUTHN )
        EXCEPT( ID_SECURITY_REQUIRED, "Method requires authentication" );

    UserData* user;

    user = reply.add_user();
    user->set_uid("jblow");
    user->set_name_last("Blow");
    user->set_name_first("Joe");

    user = reply.add_user();
    user->set_uid("jdoe");
    user->set_name_last("Doe");
    user->set_name_first("John");

    user = reply.add_user();
    user->set_uid("bsmith");
    user->set_name_last("Smith");
    user->set_name_first("Bob");

    PROC_MSG_END
}

#endif


}}
