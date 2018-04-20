#include <fstream>
#include <time.h>
#include "MsgBuf.hpp"
#include "DynaLog.hpp"
#include "CoreServer.hpp"
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

namespace Core {


Server::Server( uint32_t a_port, const string & a_cert_dir, uint32_t a_timeout, uint32_t a_num_threads, const string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass ) :
    m_port( a_port ),
    m_timeout(a_timeout),
    m_io_thread(0),
    m_maint_thread(0),
    m_num_threads(a_num_threads),
    m_io_running(false),
    m_endpoint( asio::ip::tcp::v4(), m_port ),
    m_acceptor( m_io_service, m_endpoint ),
    m_context( asio::ssl::context::tlsv12 ),
    m_xfr_thread(0),
    m_db_url(a_db_url),
    m_db_user(a_db_user),
    m_db_pass(a_db_pass),
    m_db_client( m_db_url, m_db_user, m_db_pass )
{
    m_context.set_options(
        asio::ssl::context::default_workarounds |
        asio::ssl::context::no_sslv2 |
        asio::ssl::context::no_sslv3 |
        asio::ssl::context::no_tlsv1 |
        asio::ssl::context::no_tlsv1_1 |
        asio::ssl::context::single_dh_use );

    m_cert_file = a_cert_dir + "sdms-core-cert.pem";
    m_key_file = a_cert_dir + "sdms-core-key.pem";
    m_key_path = a_cert_dir + "ssh/";

    cout << "cert file: " << m_cert_file << "\n";
    cout << "key file: " << m_key_file << "\n";

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
    spSession session = make_shared<Session>( m_io_service, m_context, *this, m_db_url, m_db_user, m_db_pass );

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
                cout << "CLOSING IDLE SESSION\n";
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
    size_t file_size;
    time_t mod_time;
    Auth::RecordUpdateRequest upd_req;
    Auth::RecordDataReply  reply;
    string error_msg;

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
                //cout << "poll: " << (*ixfr)->poll << "\n";

                if ( (*ixfr)->stage == 0 )
                {
                    // Start xfr, get task ID, update DB
                    // Use Legacy Globus CLI to start transfer
                    cout << "start xfr\n";

                    keyfile = m_key_path + (*ixfr)->uid + "-key";

                    cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org transfer -- ";
                    //cmd = "ssh globus transfer -- " + (*ixfr)->data_path + " " + (*ixfr)->dest_path;
                    //cmd = "ssh globus transfer -- ";

                    if ( (*ixfr)->mode == XM_PUT )
                        cmd += (*ixfr)->local_path + " " + (*ixfr)->repo_path;
                    else
                        cmd += (*ixfr)->repo_path + " " + (*ixfr)->local_path;

                    // HACK Need err msg if things go wrong
                    cmd += " 2>&1";

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
                        m_db_client.xfrUpdate( (*ixfr)->id, 0, "", (*ixfr)->task_id.c_str() );
                        (*ixfr)->stage = 1;
                        (*ixfr)->poll = INIT_POLL_PERIOD;
                        ixfr++;
                    }
                    else
                    {
                        //cout << "Globus CLI Error\nResult:[" << result << "]";
                        for ( string::iterator c = result.begin(); c != result.end(); c++ )
                        {
                            if ( *c == '\n' )
                                *c = '.';
                        }

                        status = XS_FAILED;
                        m_db_client.xfrUpdate( (*ixfr)->id, &status, result );
                        ixfr = m_xfr_active.erase( ixfr );
                    }
                }
                else
                {
                    if ( --(*ixfr)->poll == 0 )
                    {
                        //cout << "poll (" << (*ixfr)->poll << ") xfr\n";

                        // Get current status
                        keyfile = m_key_path + (*ixfr)->uid + "-key";

                        //cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org status -f status " + (*ixfr)->task_id;
                        cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org events " + (*ixfr)->task_id + " -f code -O kv";
                        result = exec( cmd.c_str() );
                        if ( parseGlobusEvents( result, status, error_msg ))
                        {
                            // Cancel the xfr task
                            cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org cancel " + (*ixfr)->task_id;
                            result = exec( cmd.c_str() );
                            cout << "Cancel result: " << result << "\n";
                        }

                        cout << "Task " << (*ixfr)->task_id << " status: " << status << "\n";

                        if ( (*ixfr)->status != status )
                        {
                            (*ixfr)->status = status;

                            // Update DB entry
                            m_db_client.xfrUpdate( (*ixfr)->id, &(*ixfr)->status, error_msg );

                            if ( (*ixfr)->mode == XM_PUT )
                            {
                                mod_time = time(0);

                                if ( (*ixfr)->status == XS_SUCCEEDED )
                                {
                                    // TODO Path must not be assumed
                                    /*
                                    if ( !m_store.dataGetSize( string("/data/") + (*ixfr)->data_id.substr(2), file_size ))
                                    {
                                        // TODO This should not happen. If it does something is very very wrong
                                        DL_ERROR( "Transfer succeeded but destination file does not exist! Transfer ID: " << (*ixfr)->id );
                                        file_size = 0;
                                    }*/
                                }
                                else
                                {
                                    // TODO How to handle PUT errors?
                                    file_size = 0;
                                }

                                // Update DB record with new file stats
                                upd_req.set_id( (*ixfr)->data_id );
                                upd_req.set_data_size( file_size );
                                upd_req.set_data_time( mod_time );
                                upd_req.set_subject( (*ixfr)->uid );
                                reply.Clear();

                                m_db_client.recordUpdate( upd_req, reply );
                            }
                        }

                        // Remove from active list
                        if ( (*ixfr)->status > XS_INACTIVE )
                        {
                            ixfr = m_xfr_active.erase( ixfr );
                        }
                        else
                        {
                            // Backoff increments each poll interval, but time waited only increments
                            // every two poll intervals. This allows polling to better match size of
                            // file being transferred.
                            if ( (*ixfr)->backoff < MAX_BACKOFF )
                                (*ixfr)->backoff++;

                            (*ixfr)->poll = INIT_POLL_PERIOD*(1<<((*ixfr)->backoff >> 1));
                            ++ixfr;
                        }
                    }
                    else
                        ++ixfr;
                }
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

bool
Server::parseGlobusEvents( const std::string & a_events, XfrStatus & status, std::string & a_err_msg )
{
    status = XS_INACTIVE;

    size_t p1 = 0;
    size_t p2 = a_events.find_first_of( "=", 0 );
    string tmp;
    size_t fault_count = 0;

    a_err_msg.clear();

    while ( p2 != string::npos )
    {
        tmp = a_events.substr( p1, p2 - p1 );
        if ( tmp != "code" )
            return XS_FAILED;

        p1 = p2 + 1;
        p2 = a_events.find_first_of( "\n", p1 );
        if ( p2 != string::npos )
            tmp = a_events.substr( p1, p2 - p1 );
        else
            tmp = a_events.substr( p1 );

        cout << "event: " << tmp << "\n";

        if ( tmp == "STARTED" || tmp == "PROGRESS" )
            status = XS_ACTIVE;
        else if ( tmp == "SUCCEEDED" )
            status = XS_SUCCEEDED;
        else if ( tmp == "CANCELED" )
        {
            status = XS_FAILED;
            a_err_msg = tmp;
        }
        else if ( tmp == "CONNECTION_RESET" )
        {
            status = XS_INIT;
            if ( ++fault_count > 10 )
            {
                status = XS_FAILED;
                a_err_msg = "Could not connect";
                return true;
            }
        }
        else
        {
            status = XS_FAILED;
            a_err_msg = tmp;
            return true;
        }

        // TODO There may be non-fatal error codes that should be checked for

        if ( p2 == string::npos )
            break;

        p1 = p2 + 1;
        p2 = a_events.find_first_of( "=", p1 );
    }

    return false;
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
    string key_file = m_key_path + a_uid + "-key";

    string cmd = "yes|ssh-keygen -q -t rsa -b 2048 -P '' -C \"SDMS SSH Key for " + a_uid + "\" -f " + key_file;
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
    string key_file = m_key_path + a_uid + "-key.pub";

    lock_guard<mutex> lock( m_key_mutex );

    ifstream inf( key_file );
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
        XfrDataInfo * xfr_entry = new XfrDataInfo( a_xfr, a_uid );
        m_xfr_all[a_xfr.id()] = xfr_entry;
        m_xfr_pending.push_back( a_xfr.id() );
    }
}

void
Server::dataDelete( const std::string & a_data_id )
{
    // TODO Send delete cmd to appropriate repo server

    //m_store.dataDelete( a_data_id );
}

}}
