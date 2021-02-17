#include <fstream>
#include <chrono>
#include <time.h>
#include <curl/curl.h>
#include "DynaLog.hpp"
#include "Util.hpp"
#include "CoreServer.hpp"
#include "TaskMgr.hpp"
#include "ClientWorker.hpp"
#include "MsgComm.hpp"
#include "DatabaseAPI.hpp"


#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))

#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 3600

using namespace std;

namespace SDMS {

namespace Core {


Server::Server() :
    m_config(Config::getInstance()),
    m_io_secure_thread(0),
    m_io_insecure_thread(0),
    m_io_running(false),
    m_zap_thread(0),
    m_msg_router_thread(0),
    m_db_maint_thread(0)
{
    curl_global_init( CURL_GLOBAL_DEFAULT );

    loadKeys( m_config.cred_dir );

    m_config.sec_ctx.is_server = true;
    m_config.sec_ctx.public_key = m_pub_key;
    m_config.sec_ctx.private_key = m_priv_key;

    waitForDB();
    loadRepositoryConfig();

    m_zap_thread = new thread( &Server::zapHandler, this );
    m_db_maint_thread = new thread( &Server::dbMaintenance, this );

    // Create task mgr (starts it's own threads)
    TaskMgr::getInstance();
}


Server::~Server()
{
    // TODO There is no way to cleanly shutdown the server, prob not needed

    m_zap_thread->join();
    delete m_zap_thread;

    m_db_maint_thread->join();
    delete m_db_maint_thread;
}

void
Server::loadKeys( const std::string & a_cred_dir )
{
    string fname = a_cred_dir + "datafed-core-key.pub";
    ifstream inf( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open public key file: " << fname );
    inf >> m_pub_key;
    inf.close();

    fname = a_cred_dir + "datafed-core-key.priv";
    inf.open( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open private key file: " << fname );
    inf >> m_priv_key;
    inf.close();
}


void
Server::waitForDB()
{
    DL_INFO("Waiting for DB...");

    for ( int i = 0; i < 10; i++ )
    {
        try
        {
            DatabaseAPI  db_client( m_config.db_url, m_config.db_user, m_config.db_pass );
            db_client.serverPing();
            return;
        }
        catch(...)
        {
            DL_INFO("DB connection error");
        }
        sleep( 5 );
    }

    EXCEPT(1,"Unable to connect to DB");
}


void
Server::loadRepositoryConfig()
{
    DL_INFO("Loading repo configuration");

    DatabaseAPI  db_client( m_config.db_url, m_config.db_user, m_config.db_pass );

    vector<RepoData*> repos;

    db_client.repoList( repos );

    for ( vector<RepoData*>::iterator r = repos.begin(); r != repos.end(); ++r )
    {
        // Validate repo settings (in case an admin manually edits repo config)
        if ( (*r)->pub_key().size() != 40 ){
            DL_ERROR("Ignoring " << (*r)->id() << " - invalid public key: " << (*r)->pub_key() );
            continue;
        }

        if ( (*r)->address().compare(0,6,"tcp://") ){
            DL_ERROR("Ignoring " << (*r)->id() << " - invalid server address: " << (*r)->address() );
            continue;
        }

        if ( (*r)->endpoint().size() != 36 ){
            DL_ERROR("Ignoring " << (*r)->id() << " - invalid endpoint UUID: " << (*r)->endpoint() );
            continue;
        }

        if ( (*r)->path().size() == 0 || (*r)->path()[0] != '/' ){
            DL_ERROR("Ignoring " << (*r)->id() << " - invalid path: " << (*r)->path() );
            continue;
        }

        DL_DEBUG("Repo " << (*r)->id() << " OK");
        DL_DEBUG("UUID: " << (*r)->endpoint() );

        // Cache repo data for data handling
        m_config.repos[(*r)->id()] = *r;

        // Cache pub key for ZAP handler
        m_auth_clients[(*r)->pub_key()] = (*r)->id();
    }
}

void
Server::run()
{
    if ( m_io_running )
        throw runtime_error( "Only one worker router instance allowed" );

    m_io_running = true;
    DL_INFO( "Public/private MAPI starting on ports " << m_config.port << "/" << ( m_config.port + 1))


    m_msg_router_thread = new thread( &Server::msgRouter, this );
    m_io_secure_thread = new thread( &Server::ioSecure, this );
    ioInsecure();


    m_io_running = false;
    m_router_cvar.notify_all();

    m_msg_router_thread->join();
    delete m_msg_router_thread;
    m_msg_router_thread = 0;
}


void
Server::msgRouter()
{
    void * ctx = MsgComm::getContext();

    void *frontend = zmq_socket( ctx, ZMQ_ROUTER );
    int linger = 100;
    zmq_setsockopt( frontend, ZMQ_LINGER, &linger, sizeof( int ));
    zmq_bind( frontend, "inproc://msg_proc" );

    void *backend = zmq_socket( ctx, ZMQ_DEALER );
    zmq_setsockopt( backend, ZMQ_LINGER, &linger, sizeof( int ));

    zmq_bind( backend, "inproc://workers" );

    void *control = zmq_socket( ctx, ZMQ_SUB );
    zmq_setsockopt( control, ZMQ_LINGER, &linger, sizeof( int ));
    zmq_connect( control, "inproc://control" );
    zmq_setsockopt( control, ZMQ_SUBSCRIBE, "", 0 );

    // Ceate worker threads
    for ( uint16_t t = 0; t < m_config.num_client_worker_threads; ++t )
        m_workers.push_back( new ClientWorker( *this, t+1 ));

    // Connect backend to frontend via a proxy
    zmq_proxy_steerable( frontend, backend, 0, control );

    zmq_close( backend );
    zmq_close( control );

    // Clean-up workers
    vector<ClientWorker*>::iterator iwrk;

    for ( iwrk = m_workers.begin(); iwrk != m_workers.end(); ++iwrk )
        (*iwrk)->stop();

    for ( iwrk = m_workers.begin(); iwrk != m_workers.end(); ++iwrk )
        delete *iwrk;
}

void
Server::ioSecure()
{
    try
    {
        MsgComm frontend( "tcp://*:" + to_string(m_config.port), MsgComm::ROUTER, true, &m_config.sec_ctx );
        MsgComm backend( "inproc://msg_proc", MsgComm::DEALER, false );

        // Must use custom proxy to inject ZAP User-Id into message frame
        frontend.proxy( backend );
    }
    catch( exception & e)
    {
        DL_ERROR( "Exception in secure interface: " << e.what() )
    }
}

void
Server::ioInsecure()
{
    try
    {
        MsgComm frontend( "tcp://*:" + to_string(m_config.port + 1), MsgComm::ROUTER, true );
        MsgComm backend( "inproc://msg_proc", MsgComm::DEALER, false );

        zmq_proxy( frontend.getSocket(), backend.getSocket(), 0 );
    }
    catch( exception & e)
    {
        DL_ERROR( "Exception in insecure interface: " << e.what() )
    }
}

void
Server::dbMaintenance()
{
    chrono::system_clock::duration  purge_per = chrono::seconds( m_config.note_purge_period );
    DatabaseAPI                     db( m_config.db_url, m_config.db_user, m_config.db_pass );

    while ( 1 )
    {
        try
        {
            DL_DEBUG( "DB Maint: Purging closed annotations" );
            db.annotationPurge( m_config.note_purge_age );
        }
        catch( TraceException & e )
        {
            DL_ERROR( "DB Maint:" << e.toString() );
        }
        catch( exception & e )
        {
            DL_ERROR( "DB Maint:" << e.what() );
        }
        catch( ... )
        {
            DL_ERROR( "DB Maint: Unknown exception" );
        }

        this_thread::sleep_for( purge_per );
    }
    DL_ERROR( "DB maintenance thread exiting" );
}


void
Server::zapHandler()
{
    DL_INFO( "ZAP handler thread starting" );
    
    try
    {
        void *      ctx = MsgComm::getContext();
        char        client_key_text[41];
        void *      socket = zmq_socket( ctx, ZMQ_REP );
        int         rc;
        char        version[100];
        char        request_id[100];
        char        domain[100];
        char        address[100];
        char        identity_property[100];
        char        mechanism[100];
        char        client_key[100];
        string      uid;
        time_t      now, next_purge;
        auth_client_map_t::iterator     iclient;
        trans_client_map_t::iterator    itrans_client;
        zmq_pollitem_t                  poll_items[] = { socket, 0, ZMQ_POLLIN, 0 };
        DatabaseAPI                  db( m_config.db_url, m_config.db_user, m_config.db_pass );

        if (( rc = zmq_bind( socket, "inproc://zeromq.zap.01" )) == -1 )
            EXCEPT( 1, "Bind on ZAP failed." );

        next_purge = time(0) + 30;

        while ( 1 )
        {
            try
            {
                if (( rc = zmq_poll( poll_items, 1, 10000 )) == -1 )
                    EXCEPT( 1, "Poll on ZAP socket failed." );

                if ( m_trans_auth_clients.size() )
                {
                    now = time( 0 );
                    if ( now > next_purge )
                    {
                        DL_DEBUG( "ZAP: Purging expired transient clients" );
                        lock_guard<mutex> lock( m_trans_client_mutex );

                        for ( itrans_client = m_trans_auth_clients.begin(); itrans_client != m_trans_auth_clients.end(); )
                        {
                            if ( itrans_client->second.second < now )
                            {
                                DL_DEBUG( "ZAP: Purging client " << itrans_client->second.first );
                                itrans_client = m_trans_auth_clients.erase( itrans_client );
                            }
                            else
                                itrans_client++;
                        }

                        next_purge = now + 30;
                    }
                }

                if ( !(poll_items[0].revents & ZMQ_POLLIN ))
                    continue;

                if (( rc = zmq_recv( socket, version, 100, 0 )) == -1 )
                    EXCEPT( 1, "Rcv version failed." );
                version[rc] = 0;
                if (( rc = zmq_recv( socket, request_id, 100, 0 )) == -1 )
                    EXCEPT( 1, "Rcv request_id failed." );
                request_id[rc] = 0;
                if (( rc = zmq_recv( socket, domain, 100, 0 )) == -1 )
                    EXCEPT( 1, "Rcv domain failed." );
                domain[rc] = 0;
                if (( rc = zmq_recv( socket, address, 100, 0 )) == -1 )
                    EXCEPT( 1, "Rcv address failed." );
                address[rc] = 0;
                if (( rc = zmq_recv( socket, identity_property, 100, 0 )) == -1 )
                    EXCEPT( 1, "Rcv identity_property failed." );
                identity_property[rc] = 0;
                if (( rc = zmq_recv( socket, mechanism, 100, 0 )) == -1 )
                    EXCEPT( 1, "Rcv mechanism failed." );
                mechanism[rc] = 0;
                if (( rc = zmq_recv( socket, client_key, 100, 0 )) == -1 )
                    EXCEPT( 1, "Rcv client_key failed." );
                client_key[rc] = 0;

                if ( rc != 32 )
                    EXCEPT( 1, "Invalid client_key length." );

                if ( !zmq_z85_encode( client_key_text, (uint8_t*)client_key, 32 ))
                    EXCEPT( 1, "Encode of client_key failed." );

                /* cout << "ZAP request:" <<
                    "\n\tversion: " << version <<
                    "\n\trequest_id: " << request_id <<
                    "\n\tdomain: " << domain <<
                    "\n\taddress: " << address <<
                    "\n\tidentity_property: " << identity_property <<
                    "\n\tmechanism: " << mechanism <<
                    "\n\tclient_key: " << client_key_text << "\n";
                */
                cout << "ZAP client key ["<< client_key_text << "]\n";

                // Always accept - but only set UID if it's a known client (by key)
                if (( iclient = m_auth_clients.find( client_key_text )) != m_auth_clients.end())
                {
                    uid = iclient->second;
                    DL_DEBUG( "ZAP: Known pre-authorized client connected: " << uid );
                }
                else if ( isClientAuthorized( client_key_text, uid ))
                {
                    DL_DEBUG( "ZAP: Known transient client connected: " << uid );
                }
                else
                {
                    if ( db.uidByPubKey( client_key_text, uid ) )
                    {
                        DL_DEBUG( "ZAP: Known client connected: " << uid );
                    }
                    else
                    {
                        uid = string("anon_") + client_key_text;
                        DL_DEBUG( "ZAP: Unknown client connected: " << uid );
                    }
                }

                zmq_send( socket, "1.0", 3, ZMQ_SNDMORE );
                zmq_send( socket, request_id, strlen(request_id), ZMQ_SNDMORE );
                zmq_send( socket, "200", 3, ZMQ_SNDMORE );
                zmq_send( socket, "", 0, ZMQ_SNDMORE );
                zmq_send( socket, uid.c_str(), uid.size(), ZMQ_SNDMORE );
                zmq_send( socket, "", 0, 0 );

            }
            catch( TraceException & e )
            {
                DL_ERROR( "ZAP handler:" << e.toString() );
            }
            catch( exception & e )
            {
                DL_ERROR( "ZAP handler:" << e.what() );
            }
            catch( ... )
            {
                DL_ERROR( "ZAP handler: Unknown exception" );
            }
        }

        zmq_close( socket );
    }
    catch( TraceException & e )
    {
        DL_ERROR( "ZAP handler:" << e.toString() );
    }
    catch( exception & e )
    {
        DL_ERROR( "ZAP handler:" << e.what() );
    }
    catch( ... )
    {
        DL_ERROR( "ZAP handler: unknown exception type" );
    }
    DL_INFO( "ZAP handler thread exiting" );
}


void
Server::authorizeClient( const std::string & a_cert_uid, const std::string & a_uid )
{
    if ( strncmp( a_cert_uid.c_str(), "anon_", 5 ) == 0 )
    {
        lock_guard<mutex> lock( m_trans_client_mutex );

        m_trans_auth_clients[a_cert_uid.substr( 5 )] = make_pair<>( a_uid, time(0) + 30 );
    }
}

bool
Server::isClientAuthorized( const std::string & a_client_key, std::string & a_uid )
{
    lock_guard<mutex> lock( m_trans_client_mutex );

    trans_client_map_t::iterator i = m_trans_auth_clients.find( a_client_key );
    if ( i != m_trans_auth_clients.end())
    {
        a_uid = i->second.first;
        m_trans_auth_clients.erase( i );

        return true;
    }

    return false;
}


}}
