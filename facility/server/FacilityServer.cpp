#include <iostream>
#include <algorithm>
#include <stdexcept>

#include "unistd.h"
#include "sys/types.h"

#include <zmq.h>

#include "FacilityServer.hpp"
#include "GSSAPI_Utils.hpp"

using namespace std;

namespace SDMS {
namespace Facility {

#define DEBUG_GSI
#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 30

// Class ctor/dtor

Server::Server( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout, uint32_t a_num_workers ) :
    m_connection( a_server_host, a_server_port, Connection::Server ),
    m_timeout(a_timeout * 1000),
    m_router_thread(0),
    m_maint_thread(0),
    m_num_workers(a_num_workers),
    m_router_running(false),
    m_worker_running(false),
    m_sec_cred(0)
    
{
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

    Worker::m_proc_funcs[FMT_PING] = &Worker::procMsgPing;
    Worker::m_proc_funcs[FMT_LOGIN] = &Worker::procMsgLogIn;
    Worker::m_proc_funcs[FMT_LOGOUT] = &Worker::procMsgLogOut;
    Worker::m_proc_funcs[FMT_USER_LIST] = &Worker::procMsgUserCommands;
    Worker::m_proc_funcs[FMT_USER_VIEW] = &Worker::procMsgUserCommands;
}


Server::~Server()
{
    globus_module_deactivate( GLOBUS_GSI_GSSAPI_MODULE );
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
        void *control = zmq_socket( m_connection.getContext(), ZMQ_PUB );

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
Server::workerRouter()
{
    if ( m_num_workers == 0 )
        m_num_workers = max( 1u , std::thread::hardware_concurrency() - 1);

    void * context = m_connection.getContext();

    //  Backend socket talks to workers over inproc

    void *backend = zmq_socket( context, ZMQ_DEALER );
    int linger = 100;
    if( zmq_setsockopt( backend, ZMQ_LINGER, &linger, sizeof( int )) == -1 )
        throw runtime_error("zmq_setsockopt linger failed");
    if ( zmq_bind( backend, "inproc://workers" ) == -1 )
        throw runtime_error("zmq_bind failed");

    // Control socket allows router to be paused, resumed, and stopped
    void *control = zmq_socket( context, ZMQ_SUB );
    if ( zmq_setsockopt( control, ZMQ_LINGER, &linger, sizeof( int )) == -1 )
        throw runtime_error("zmq_setsockopt linger failed");
    if ( zmq_connect( control, "inproc://control" ) == -1 )
        throw runtime_error("zmq_connect failed");
    if ( zmq_setsockopt( control, ZMQ_SUBSCRIBE, "", 0 ) == -1 )
        throw runtime_error("zmq_setsockopt subscribe failed");

    m_worker_running = true;

    // Ceate worker threads
    for ( uint32_t t = 0; t < m_num_workers; ++t )
        m_workers.push_back( new Worker( *this, context, t+1 ));

    // Connect backend to frontend via a proxy
    zmq_proxy_steerable( m_connection.getSocket(), backend, 0, control );

    m_worker_running = false;

    zmq_close( backend );
    zmq_close( control );

    // Clean-up workers

    for ( vector<Worker*>::iterator iwrk = m_workers.begin(); iwrk != m_workers.end(); ++iwrk )
    {
        (*iwrk)->join();
        delete *iwrk;
    }

    m_workers.clear();

    //m_router_running = false;
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

                if ( ci->second.sec_ctx )
                {
                    OM_uint32  min_stat;
                    
                    gss_delete_sec_context( &min_stat, &ci->second.sec_ctx, GSS_C_NO_BUFFER );
                }

                ci = m_client_info.erase( ci );
            }
            else
                ++ci;
        }
    }
}


Server::ClientInfo &
Server::getClientInfo( Connection::MsgBuffer & a_msg_buffer, bool a_upd_last_act )
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



// ----- Worker Class Implementation -----------------------------------

Server::Worker::msg_fun_t    Server::Worker::m_proc_funcs[_FMT_END] = {};

Server::Worker::Worker( Server &a_server, void *a_context, int a_id )
    : m_server(a_server), m_context(a_context), m_worker_thread(0), m_id(a_id)
{
    m_worker_thread = new thread( &Server::Worker::workerThread, this );
}

Server::Worker::~Worker()
{
    delete m_worker_thread;
}


void
Server::Worker::workerThread()
{
    //cout << "W" << m_id << " starting" << endl;

    m_conn = new Connection( "inproc://workers", Connection::Worker, m_context );

    Connection::MsgBuffer buffer;
    Connection::MsgHeader * header;
    msg_fun_t f;

    while ( m_server.m_worker_running )
    {
        try
        {
            while ( m_server.m_worker_running )
            {
                if ( m_conn->recv( buffer, 1000 ))
                {
                    header = (Connection::MsgHeader *)buffer.data();

                    if ( header->msg_type < _FMT_END )
                    {
                        f = m_proc_funcs[header->msg_type];
                        if ( f )
                            (this->*f)( buffer );
                        else
                            cout << "Recv msg type: " << header->msg_type << " with no defined handler\n";
                    }
                    else
                        cout << "Recv bad msg type: " << header->msg_type << "\n";
                }
            }
        }
        catch( exception &e )
        {
            cout << "Worker " << m_id << " excepiton: " << e.what() << "\n";
        }
    }

    delete m_conn;

    //cout << "W" << m_id << " exiting" << endl;
}

void
Server::Worker::join()
{
    m_worker_thread->join();
}

void
Server::Worker::procMsgPing( Connection::MsgBuffer & a_msg_buffer )
{
    ClientInfo & client = m_server.getClientInfo( a_msg_buffer, true );

    cout << "proc ping, cid: " << a_msg_buffer.cid() << "\n";

    MsgPing * msg = (MsgPing *)a_msg_buffer.data();

    if ( a_msg_buffer.size() != sizeof( MsgPing ))
    {
        cout << "Wrong size of MsgPing msg: " << a_msg_buffer.size() << "\n";

        a_msg_buffer.setSize( sizeof( Connection::MsgHeader ));
        Connection::MsgHeader * nack = (Connection::MsgHeader *)a_msg_buffer.data();
        nack->reinit( FMT_NACK );
    }

    m_conn->send( a_msg_buffer );
}

void
Server::Worker::procMsgLogIn( Connection::MsgBuffer & a_msg_buffer )
{
    cout << "proc login\n";

    ClientInfo & client = m_server.getClientInfo( a_msg_buffer, true );
    Connection::MsgHeader *msg = (Connection::MsgHeader*)a_msg_buffer.data();
    string err_msg;

    //cout << "client state: " << client.state << "\n";

    if ( client.state == CS_AUTHN )
    {
        err_msg = "Already authenticated";
    }
    else
    {
        OM_uint32           maj_stat, min_stat;
        gss_buffer_desc     init_token;
        gss_buffer_desc     accept_token = GSS_C_EMPTY_BUFFER;

        if ( msg->data_size )
        {
            //cout << "ini tok size: " << msg->data_size << "\n";
            init_token.value = a_msg_buffer.data() + msg->msg_size;
            init_token.length = msg->data_size;

            maj_stat = gss_accept_sec_context( &min_stat, &client.sec_ctx, m_server.m_sec_cred,
                &init_token, GSS_C_NO_CHANNEL_BINDINGS, 0, 0,
                &accept_token, 0, 0, 0 );

            if ( GSS_ERROR( maj_stat ))
            {
                err_msg = "gss_accept_sec_context failed";
            }
            else if ( accept_token.length )
            {
                // Send token to client
                //cout << "send acc tok\n";
                a_msg_buffer.setSize( sizeof(Connection::MsgHeader) + accept_token.length );
                msg->reinit( FMT_LOGIN );
                msg->data_size = accept_token.length;
                //cout << "cpy acc tok\n";
                memcpy( a_msg_buffer.data() + sizeof(Connection::MsgHeader), accept_token.value, accept_token.length );
                //cout << "free acc tok\n";
                free( accept_token.value );
            }
            else
            {
                // Done, check client identity
                //cout << "done\n";

                gss_name_t src_name = 0;
                maj_stat = gss_inquire_context( &min_stat, client.sec_ctx, &src_name, 0, 0, 0, 0, 0, 0 );

                if ( GSS_ERROR( maj_stat ))
                    err_msg = "Failed to inquire context";
                else
                {
                    gssString   name_str( src_name );
                    client.name = name_str.to_string();
                    cout << "client name: " << client.name << "\n";
                    
                    // Ack client
                    a_msg_buffer.setSize( sizeof( Connection::MsgHeader ));
                    msg->reinit( FMT_ACK );
                    msg->data_size = 0;
                    
                    client.state = CS_AUTHN;
                }
            }
        }
        else
        {
            err_msg = "No client token data";
        }
    }

    if ( err_msg.size() )
    {
        // Send NACK with error message
        a_msg_buffer.setSize( sizeof(Connection::MsgHeader) + err_msg.size() + 1 );
        msg->reinit( FMT_NACK );
        msg->data_size = err_msg.size() + 1;
        memcpy( a_msg_buffer.data() + sizeof(Connection::MsgHeader), err_msg.c_str(), err_msg.size() + 1 );
    }

    m_conn->send( a_msg_buffer );
}

void
Server::Worker::procMsgLogOut( Connection::MsgBuffer & a_msg_buffer )
{
    cout << "proc logout\n";

    lock_guard<mutex> lock(m_server.m_data_mutex);

    map<uint32_t,ClientInfo>::iterator ci = m_server.m_client_info.find( a_msg_buffer.cid() );
    if ( ci != m_server.m_client_info.end() )
    {
        if ( ci->second.sec_ctx )
        {
            OM_uint32  min_stat;
            
            gss_delete_sec_context( &min_stat, &ci->second.sec_ctx, GSS_C_NO_BUFFER );
        }

        m_server.m_client_info.erase( ci );
    }

    a_msg_buffer.setSize( sizeof( Connection::MsgHeader ));
    Connection::MsgHeader * msg = (Connection::MsgHeader*) a_msg_buffer.data();
    msg->reinit( FMT_ACK );
    m_conn->send( a_msg_buffer );
}

void
Server::Worker::procMsgUserCommands( Connection::MsgBuffer & a_msg_buffer )
{
    cout << "proc user cmds\n";
    ClientInfo & client = m_server.getClientInfo( a_msg_buffer, true );
    string err_msg;

    if ( client.state != CS_AUTHN )
    {
        err_msg = "Method requires authentication";
    }

    Connection::MsgHeader *msg = (Connection::MsgHeader*)a_msg_buffer.data();
    msg->reinit( FMT_ACK );
    msg->data_size = 0;

    if ( err_msg.size() )
    {
        // Send NACK with error message
        a_msg_buffer.setSize( sizeof(Connection::MsgHeader) + err_msg.size() + 1 );
        msg->reinit( FMT_NACK );
        msg->data_size = err_msg.size() + 1;
        memcpy( a_msg_buffer.data() + sizeof(Connection::MsgHeader), err_msg.c_str(), err_msg.size() + 1 );
    }

    m_conn->send( a_msg_buffer );
}

}}
