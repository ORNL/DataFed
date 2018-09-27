#include <fstream>
#include <time.h>
#include <boost/filesystem.hpp>
#include "DynaLog.hpp"
#include "RepoServer.hpp"
#include "Util.hpp"

#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"


#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))

#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 300
#define INIT_POLL_PERIOD 1
#define MAX_BACKOFF 10

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace SDMS {
namespace Repo {

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func


Server::Server( const std::string & a_cred_dir, uint32_t a_port ) :
    m_port( a_port ),
    m_io_running( false )
{
    loadKeys( a_cred_dir );

    uint8_t proto_id = REG_PROTO( SDMS::Anon );

    SET_MSG_HANDLER( proto_id, StatusRequest, &Server::procStatusRequest );

    proto_id = REG_PROTO( SDMS::Auth );

    SET_MSG_HANDLER( proto_id, RepoDataDeleteRequest, &Server::procDataDeleteRequest );
    SET_MSG_HANDLER( proto_id, RepoDataGetSizeRequest, &Server::procDataGetSizeRequest );
    SET_MSG_HANDLER( proto_id, RepoPathCreateRequest, &Server::procPathCreateRequest );
    SET_MSG_HANDLER( proto_id, RepoPathDeleteRequest, &Server::procPathDeleteRequest );
}


Server::~Server()
{
}


void
Server::run( bool a_async )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
        throw runtime_error( "Only one worker router instance allowed" );

    m_io_running = true;

    if ( a_async )
    {
        m_io_thread = new thread( &Server::ioRun, this );
    }
    else
    {
        lock.unlock();
        ioRun();
        lock.lock();
        m_io_running = false;
        m_router_cvar.notify_all();
    }
}


void
Server::stop( bool a_wait )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
    {
        // TODO Need another way to terminate ZMQ threads
        //zmq_ctx_term( m_zmq_ctx );

        if ( a_wait )
        {
            if ( m_io_thread )
            {
                m_io_thread->join();
                delete m_io_thread;

                m_io_thread = 0;
                m_io_running = false;
            }
            else
            {
                while( m_io_running )
                    m_router_cvar.wait( lock );
            }
        }
    }
}


void
Server::wait()
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
    {
        if ( m_io_thread )
        {
            m_io_thread->join();
            delete m_io_thread;

            m_io_thread = 0;
            m_io_running = false;
        }
        else
        {
            while( m_io_running )
                m_router_cvar.wait( lock );
        }
    }
}

void
Server::loadKeys( const std::string & a_cred_dir )
{
    string fname = a_cred_dir + "sdms-repo-key.pub";
    ifstream inf( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open file: " << fname );
    inf >> m_pub_key;
    inf.close();

    fname = a_cred_dir + "sdms-repo-key.priv";
    inf.open( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open file: " << fname );
    inf >> m_priv_key;
    inf.close();

    fname = a_cred_dir + "sdms-core-key.pub";
    inf.open( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open file: " << fname );
    inf >> m_core_key;
    inf.close();
}

void
Server::ioRun()
{
    DL_INFO( "I/O thread started, listening on port " << m_port );

    MsgComm::SecurityContext sec_ctx;
    sec_ctx.is_server = false;
    sec_ctx.public_key = m_pub_key;
    sec_ctx.private_key = m_priv_key;
    sec_ctx.server_key = m_core_key;

    MsgComm sysComm( string("tcp://*:") + to_string(m_port), MsgComm::ROUTER, true, &sec_ctx );

    uint16_t msg_type;
    map<uint16_t,msg_fun_t>::iterator handler;

    while ( 1 )
    {
        try
        {
            if ( sysComm.recv( m_msg_buf, 2000 ))
            {
                msg_type = m_msg_buf.getMsgType();

                DL_DEBUG( "Got msg type: " << msg_type );

                handler = m_msg_handlers.find( msg_type );
                if ( handler != m_msg_handlers.end() )
                {
                    (this->*handler->second)();
                    sysComm.send( m_msg_buf );
                }
                else
                {
                    DL_ERROR( "Recv unregistered msg type: " << msg_type );
                }
            }
        }
        catch( ... )
        {
            DL_ERROR( "Unhandled exception in msg handler" );
        }
    }

    DL_INFO( "I/O thread stopped" );
}


#define PROC_MSG_BEGIN( msgclass, replyclass ) \
msgclass *request = 0; \
::google::protobuf::Message *base_msg = m_msg_buf.unserialize(); \
if ( base_msg ) \
{ \
    request = dynamic_cast<msgclass*>( base_msg ); \
    if ( request ) \
    { \
        DL_TRACE( "Rcvd: " << request->DebugString()); \
        replyclass reply; \
        try \
        {

#define PROC_MSG_END \
            m_msg_buf.serialize( reply ); \
        } \
        catch( TraceException &e ) \
        { \
            DL_WARN( e.toString() ); \
            NackReply nack; \
            nack.set_err_code( (ErrorCode) e.getErrorCode() ); \
            nack.set_err_msg( e.toString() ); \
            m_msg_buf.serialize( nack ); \
        } \
        catch( exception &e ) \
        { \
            DL_WARN( e.what() ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( e.what() ); \
            m_msg_buf.serialize( nack ); \
        } \
        catch(...) \
        { \
            DL_WARN( "unkown exception while processing message!" ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( "Unknown exception type" ); \
            m_msg_buf.serialize( nack ); \
        } \
    } \
    else { \
        DL_ERROR( "dynamic cast of msg buffer failed!" );\
    } \
    delete base_msg; \
} \
else { \
    DL_ERROR( "buffer parse failed due to unregistered msg type." ); \
}


void
Server::procStatusRequest()
{
    PROC_MSG_BEGIN( Anon::StatusRequest, Anon::StatusReply )

    DL_DEBUG( "Status request" );

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}


void
Server::procDataDeleteRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataDeleteRequest, Anon::AckReply )

    DL_DEBUG( "Data delete request for " << request->path() );

    boost::filesystem::path data_path( request->path() );

    boost::filesystem::remove( data_path );

    PROC_MSG_END
}


void
Server::procDataGetSizeRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataGetSizeRequest, Auth::RepoDataSizeReply )

    DL_DEBUG( "Data get size request for " << request->path() );

    boost::filesystem::path data_path( request->path() );

    reply.set_id( request->id() );

    if ( boost::filesystem::exists( data_path ))
    {
        reply.set_size( boost::filesystem::file_size( data_path ));
        DL_DEBUG( "size: " << reply.size() );
    }
    else
    {
        reply.set_size( 0 );
        DL_ERROR( "DataGetSizeReq - path does not exist: "  << request->path() );
    }

    PROC_MSG_END
}


void
Server::procPathCreateRequest()
{
    PROC_MSG_BEGIN( Auth::RepoPathCreateRequest, Anon::AckReply )

    DL_DEBUG( "Path create request " << request->path() );

    boost::filesystem::path data_path( request->path() );
    if ( !boost::filesystem::exists( data_path ))
    {
        boost::filesystem::create_directory( data_path );
    }

    PROC_MSG_END
}


void
Server::procPathDeleteRequest()
{
    PROC_MSG_BEGIN( Auth::RepoPathDeleteRequest, Anon::AckReply )

    DL_DEBUG( "Path delete request " << request->path() );

    boost::filesystem::path data_path( request->path() );
    if ( boost::filesystem::exists( data_path ))
    {
        boost::filesystem::remove( data_path );
    }

    PROC_MSG_END
}


}}
