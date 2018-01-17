#include <iostream>
#include <algorithm>
#include <stdexcept>

#include "unistd.h"
#include "sys/types.h"

#include <zmq.h>

extern "C"
{
    #include <gssapi.h>
    #include <globus_gss_assist.h>
}

#include "FacilityServer.hpp"

using namespace std;

namespace SDMS {
namespace Facility {

// Class ctor/dtor

Server::Server( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout, uint32_t a_num_workers ) :
    m_connection( a_server_host, a_server_port, Connection::Server ),
    m_timeout(a_timeout * 1000),
    m_router_thread(0),
    m_num_workers(a_num_workers),
    m_router_running(false),
    m_worker_running(false)
    
{
    if ( globus_module_activate( GLOBUS_GSI_GSS_ASSIST_MODULE ) != GLOBUS_SUCCESS )
        throw runtime_error("failed to activate Globus GSI GSS assist module");


    Worker::m_proc_funcs[FMT_PING] = &Worker::procMsgPing;
    Worker::m_proc_funcs[FMT_LOGIN] = &Worker::procMsgLogin;
}


Server::~Server()
{
    globus_module_deactivate( GLOBUS_GSI_GSS_ASSIST_MODULE );
}


void
Server::runWorkerRouter( bool a_async )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_router_running )
        throw runtime_error( "Only one worker router instance allowed" );

    m_router_running = true;

    if ( a_async )
        m_router_thread = new thread( &Server::workerRouter, this );
    else
    {
        lock.unlock();
        workerRouter();
        lock.lock();
        m_router_running = false;
        m_router_cvar.notify_all();
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
Server::Worker::procMsgLogin( Connection::MsgBuffer & a_msg_buffer )
{
    ClientInfo & client = m_server.getClientInfo( a_msg_buffer, true );

    cout << "proc login\n";

    Connection::MsgHeader * msg = (Connection::MsgHeader *)a_msg_buffer.data();

    if ( msg->msg_size != sizeof( Connection::MsgHeader ))
    {
        cout << "Wrong size of MsgLogin msg: " << a_msg_buffer.size() << "\n";

        Connection::MsgHeader * nack = (Connection::MsgHeader *)a_msg_buffer.data();
        nack->reinit( FMT_NACK );
    }
    else
    {
        string cert( a_msg_buffer.data() + sizeof( Connection::MsgHeader ), msg->data_size );
        cout << "Recv data[" << cert << "]\n";

        // Re-use recv buffer to send ACK
        msg->reinit( FMT_ACK );
    }

    m_conn->send( a_msg_buffer );
}

}}
