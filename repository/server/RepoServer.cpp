#include <fstream>
#include <time.h>
#include "MsgBuf.hpp"
#include "DynaLog.hpp"
#include "RepoServer.hpp"
#include "Exec.hpp"


#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))

#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 300
#define INIT_POLL_PERIOD 1
#define MAX_BACKOFF 10

using namespace std;

namespace SDMS {

//using namespace SDMS::Anon;
//using namespace SDMS::Auth;

namespace Repo {


Server::Server( uint32_t a_port, const std::string & a_cert_dir, uint32_t a_num_threads ) :
    m_port( a_port ),
    m_io_thread(0),
    m_num_threads(a_num_threads),
    m_io_running(false),
    m_endpoint( asio::ip::tcp::v4(), m_port ),
    m_acceptor( m_io_service, m_endpoint ),
    m_context( asio::ssl::context::tlsv12 )
{
    m_context.set_options(
        asio::ssl::context::default_workarounds |
        asio::ssl::context::no_sslv2 |
        asio::ssl::context::no_sslv3 |
        asio::ssl::context::no_tlsv1 |
        asio::ssl::context::no_tlsv1_1 |
        asio::ssl::context::single_dh_use );

    m_cert_file = a_cert_dir + "sdms-repo-cert.pem";
    m_key_file = a_cert_dir + "sdms-repo-key.pem";

    m_context.use_certificate_chain_file( m_cert_file.c_str() );
    m_context.use_private_key_file( m_key_file.c_str(), asio::ssl::context::pem );
    m_context.load_verify_file( m_cert_file.c_str() );
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
        // Signal ioPump to stop
        m_io_service.stop();

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
Server::ioRun()
{
    DL_INFO( "io thread started" );

    if ( m_io_service.stopped() )
        m_io_service.reset();
    
    if ( m_num_threads == 0 )
        m_num_threads = max( 1u, std::thread::hardware_concurrency() - 1 );

    accept();

    vector<thread*> io_threads;

    for ( uint32_t i = m_num_threads - 1; i > 0; i-- )
    {
        io_threads.push_back( new thread( [this](){ m_io_service.run(); } ));
        DL_DEBUG( "io extra thread started" );
    }

    m_io_service.run();

    for ( vector<thread*>::iterator t = io_threads.begin(); t != io_threads.end(); ++t )
    {
        (*t)->join();
        delete *t;
        DL_DEBUG( "io extra thread stopped" );
    }

    DL_INFO( "io thread stopped" );
}


void
Server::accept()
{
    spSession session = make_shared<Session>( m_io_service, m_context, *this );

    m_acceptor.async_accept( session->getSocket(),
        [this, session]( error_code ec )
            {
                if ( !ec )
                {
                    DL_INFO( "New connection from " << session->remoteAddress() );

                    unique_lock<mutex>  lock( m_data_mutex );
                    m_sessions.insert( session );
                    lock.unlock();

                    session->start();
                }

                accept();
            });
}


void
Server::sessionClosed( spSession a_session )
{
    lock_guard<mutex> lock( m_data_mutex );
    set<spSession>::iterator isess = m_sessions.find( a_session );
    if ( isess != m_sessions.end() )
        m_sessions.erase( isess );
}


string
Server::getDataPath( const string & a_data_id )
{
    return string( "/data/" ) + a_data_id.substr(2);
}


}}
