#include <fstream>
#include <time.h>
#include "MsgBuf.hpp"
#include "DynaLog.hpp"
#include "FacilityServer.hpp"
#include "Exec.hpp"


#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))

#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 10
#define INIT_POLL_PERIOD 5
#define MAX_BACKOFF 6

using namespace std;

namespace SDMS {

//using namespace SDMS::Anon;
//using namespace SDMS::Auth;

namespace Facility {


Server::Server( uint32_t a_port, const string & a_cert_dir, uint32_t a_timeout, uint32_t a_num_threads ) :
    m_port( a_port ),
    m_timeout(a_timeout),
    m_io_thread(0),
    m_maint_thread(0),
    m_num_threads(a_num_threads),
    m_io_running(false),
    m_endpoint( asio::ip::tcp::v4(), m_port ),
    m_acceptor( m_io_service, m_endpoint ),
    m_context( asio::ssl::context::tlsv12 ),
    m_country("US"),    // TODO Get from params
    m_org("ORNL"),    // TODO Get from params
    m_unit("CCS"),    // TODO Get from params
    m_xfr_thread(0)
{
    m_context.set_options(
        asio::ssl::context::default_workarounds |
        asio::ssl::context::no_sslv2 |
        asio::ssl::context::no_sslv3 |
        asio::ssl::context::no_tlsv1 |
        asio::ssl::context::no_tlsv1_1 |
        asio::ssl::context::single_dh_use );

    m_cert_file = a_cert_dir + "sdmsd-" + m_unit + "-cert.pem";
    m_key_file = a_cert_dir + "sdmsd-" + m_unit + "-key.pem";
    m_key_path = a_cert_dir + "ssh/";

    m_context.use_certificate_chain_file( m_cert_file.c_str() );
    m_context.use_private_key_file( m_key_file.c_str(), asio::ssl::context::pem );
    m_context.load_verify_file( m_cert_file.c_str() );

    //m_context.load_verify_file("/home/d3s/olcf/SDMS/client_cert.pem");
    //m_context.add_verify_path( m_verify_path.c_str() );
    //m_context.use_tmp_dh_file( "dh512.pem" );

    m_db_client.setClient( "sdms" );
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
        m_maint_thread = new thread( &Server::backgroundMaintenance, this );
        m_xfr_thread = new thread( &Server::xfrManagement, this );
    }
    else
    {
        lock.unlock();
        m_maint_thread = new thread( &Server::backgroundMaintenance, this );
        m_xfr_thread = new thread( &Server::xfrManagement, this );
        ioRun();
        lock.lock();
        m_io_running = false;
        m_router_cvar.notify_all();

        m_xfr_thread->join();
        delete m_xfr_thread;
        m_xfr_thread = 0;

        m_maint_thread->join();
        delete m_maint_thread;
        m_maint_thread = 0;
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

            m_xfr_thread->join();
            delete m_xfr_thread;
            m_xfr_thread = 0;

            m_maint_thread->join();
            delete m_maint_thread;
            m_maint_thread = 0;
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

            m_xfr_thread->join();
            delete m_xfr_thread;
            m_xfr_thread = 0;

            m_maint_thread->join();
            delete m_maint_thread;
            m_maint_thread = 0;
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
Server::backgroundMaintenance()
{
    DL_DEBUG( "Maint thread started" );

    struct timespec             _t;
    double                      t;
    set<spSession>::iterator    isess;
    //vector<spSession>           dead_sessions;

    //dead_sessions.reserve( 10 );

    while( m_io_running )
    {
        sleep( MAINT_POLL_INTERVAL );

        lock_guard<mutex> lock( m_data_mutex );

        clock_gettime( CLOCK_REALTIME, &_t );
        t = _t.tv_sec + (_t.tv_nsec*1e-9);

        for ( isess = m_sessions.begin(); isess != m_sessions.end(); )
        {
            if ( t - (*isess)->lastAccessTime() > CLIENT_IDLE_TIMEOUT )
            {
                (*isess)->close();
                isess = m_sessions.erase( isess );
            }
            else
                ++isess;
        }

/*
        for ( isess = dead_sessions.begin(); isess != dead_sessions.end(); ++isess )
        {
            DL_INFO( "Deleting inactive client " << *isess );
            delete *isess;
        }

        dead_sessions.clear();
*/
    }
    DL_DEBUG( "Maint thread stopped" );
}


void
Server::xfrManagement()
{
    DL_DEBUG( "Xfr thread started" );

    list<XfrDataInfo*>::iterator ixfr;
    XfrDataInfo * xfr_entry;
    string keyfile;
    string cmd;
    string result;
    XfrStatus status;

    while( m_io_running )
    {
        sleep( 1 );

        {
            lock_guard<mutex> lock( m_xfr_mutex );
            while ( m_xfr_pending.size() )
            {
                xfr_entry = m_xfr_all[m_xfr_pending.front()];
                m_xfr_active.push_front(xfr_entry);
                m_xfr_pending.pop_front();
            }
        }

        for ( ixfr = m_xfr_active.begin(); ixfr != m_xfr_active.end(); )
        {
            try
            {
                if ( (*ixfr)->poll < 0 )
                {
                    // Start xfr, get task ID, update DB
                    // Use Legacy Globus CLI to start transfer

                    keyfile = m_key_path + (*ixfr)->uid + "-" + m_unit + "-key";

                    cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org transfer -- ";
                    //cmd = "ssh globus transfer -- " + (*ixfr)->data_path + " " + (*ixfr)->dest_path;
                    //cmd = "ssh globus transfer -- ";

                    if ( (*ixfr)->mode == XM_PUT )
                        cmd += (*ixfr)->local_path + " " + (*ixfr)->repo_path;
                    else
                        cmd += (*ixfr)->repo_path + " " + (*ixfr)->local_path;

                    cout << cmd << "\n";

                    {
                        lock_guard<mutex> lock( m_key_mutex );
                        result = exec( cmd.c_str() );
                    }

                    if ( result.compare( 0, 9, "Task ID: " ) == 0 )
                    {
                        (*ixfr)->task_id = result.substr( 9 );
                        (*ixfr)->task_id.erase(remove((*ixfr)->task_id.begin(), (*ixfr)->task_id.end(), '\n'), (*ixfr)->task_id.end());
                        //cout << "New task[" << (*ixfr)->task_id << "]\n";

                        cout << "Task " << (*ixfr)->task_id << " started\n";

                        // Update DB entry
                        m_db_client.xfrUpdate( (*ixfr)->id, 0, (*ixfr)->task_id.c_str() );
                        (*ixfr)->poll = INIT_POLL_PERIOD;
                        ixfr++;
                    }
                    else
                    {
                        cout << "Globus CLI Error\n";
                        status = XS_FAILED;
                        m_db_client.xfrUpdate( (*ixfr)->id, &status );
                        ixfr = m_xfr_active.erase( ixfr );
                    }
                }
                else if ( --(*ixfr)->poll == 0 )
                {
                    // Get current status
                    keyfile = m_key_path + (*ixfr)->uid + "-" + m_unit + "-key";

                    cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org status -f status " + (*ixfr)->task_id;
                    result = exec( cmd.c_str() );

                    if ( result.compare( "Status: SUCCEEDED\n" ) == 0 )
                        status = XS_SUCCEEDED;
                    else if ( result.compare( "Status: FAILED\n" ) == 0 )
                        status = XS_FAILED;
                    else if ( result.compare( "Status: ACTIVE\n" ) == 0 )
                        status = XS_ACTIVE;
                    else if ( result.compare( "Status: INACTIVE\n" ) == 0 )
                        status = XS_INACTIVE;
                    else
                    {
                        EXCEPT_PARAM( 1, "Invalid globus reply: " << result );
                    }

                    cout << "Task " << (*ixfr)->task_id << " status: " << status << "\n";

                    if ( (*ixfr)->status != status )
                    {
                        (*ixfr)->status = status;

                        // Update DB entry
                        m_db_client.xfrUpdate( (*ixfr)->id, &(*ixfr)->status );
                    }

                    // Remove from active list
                    if ( (*ixfr)->status > XS_INACTIVE )
                    {
                        ixfr = m_xfr_active.erase( ixfr );
                    }
                    else
                    {
                        if ( (*ixfr)->backoff < MAX_BACKOFF )
                            (*ixfr)->backoff++;

                        (*ixfr)->poll = INIT_POLL_PERIOD*(1<<(*ixfr)->backoff);
                        ++ixfr;
                    }
                }
                else
                    ++ixfr;
            }
            catch( TraceException & e )
            {
                cout << "XFR thread exception: " << e.toString() << "\n";
                ixfr = m_xfr_active.erase( ixfr );
            }
            catch(...)
            {
                cout << "XFR thread exception!\n";
                ixfr = m_xfr_active.erase( ixfr );
            }
        }
    }
    DL_DEBUG( "Xfr thread stopped" );
}


void
Server::sessionClosed( spSession a_session )
{
    lock_guard<mutex> lock( m_data_mutex );
    set<spSession>::iterator isess = m_sessions.find( a_session );
    if ( isess != m_sessions.end() )
        m_sessions.erase( isess );
}


void
Server::generateKeys( const std::string & a_uid, std::string & a_key_data )
{
    string key_file = m_key_path + a_uid + "-" + m_unit + "-key";

    string cmd = "yes|ssh-keygen -q -t rsa -b 2048 -P '' -C \"SDMS SSH Key for " + a_uid + " (" + m_unit + ")\" -f " + key_file;
    //cout << "cmd: " << cmd << "\n";

    lock_guard<mutex> lock( m_key_mutex );

    if ( system( cmd.c_str() ))
        EXCEPT( ID_SERVICE_ERROR, "SSH key generation failed." );

    ifstream inf( key_file + ".pub" );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT( ID_SERVICE_ERROR, "Could not open new ssh public key file" );

    a_key_data.assign(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());

    inf.close();
}


void
Server::getPublicKey( const std::string & a_uid, std::string & a_key_data )
{
    string key_file = m_key_path + a_uid + "-" + m_unit + "-key";

    lock_guard<mutex> lock( m_key_mutex );

    ifstream inf( key_file + ".pub" );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT( ID_SERVICE_ERROR, "Could not open new ssh public key file" );

    a_key_data.assign(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());

    inf.close();
}


void
Server::handleNewXfr( const XfrData & a_xfr, const string & a_uid )
{
    lock_guard<mutex> lock(m_xfr_mutex);

    if ( m_xfr_all.find( a_xfr.id() ) == m_xfr_all.end() )
    {
        XfrDataInfo * xfr_entry = new XfrDataInfo( a_xfr, a_uid, -1 );
        m_xfr_all[a_xfr.id()] = xfr_entry;
        m_xfr_pending.push_back( a_xfr.id() );
    }
}

}}
