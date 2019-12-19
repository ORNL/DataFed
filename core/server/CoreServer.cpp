#include <fstream>
#include <time.h>
#include <curl/curl.h>

#include "MsgBuf.hpp"
#include "DynaLog.hpp"
#include "CoreServer.hpp"
#include "Util.hpp"


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
    m_maint_thread(0),
    m_io_running(false),
    m_zap_thread(0),
    //m_xfr_mgr( *this ),
    m_msg_router_thread(0)
{
    curl_global_init( CURL_GLOBAL_DEFAULT );

    loadKeys (m_config.cred_dir );
    m_sec_ctx.is_server = true;
    m_sec_ctx.public_key = m_pub_key;
    m_sec_ctx.private_key = m_priv_key;

    loadRepositoryConfig();

    m_zap_thread = new thread( &Server::zapHandler, this );
}


Server::~Server()
{
    stop( true );

    m_zap_thread->join();
    delete m_zap_thread;
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
Server::loadRepositoryConfig()
{
    DL_INFO("Loading repo configuration");

    DatabaseClient  db_client( m_config.db_url, m_config.db_user, m_config.db_pass );

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
        m_repos[(*r)->id()] = *r;

        // Cache pub key for ZAP handler
        m_auth_clients[(*r)->pub_key()] = (*r)->id();
    }
}

void
Server::run( bool a_async )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
        throw runtime_error( "Only one worker router instance allowed" );

    m_io_running = true;
    DL_INFO( "Public/private MAPI starting on ports " << m_config.port << "/" << ( m_config.port + 1))

    if ( a_async )
    {
        //m_io_thread = new thread( &Server::ioRun, this );
        //m_xfr_mgr.start();
        m_maint_thread = new thread( &Server::backgroundMaintenance, this );
        m_msg_router_thread = new thread( &Server::msgRouter, this );
        m_io_secure_thread = new thread( &Server::ioSecure, this );
        m_io_insecure_thread = new thread( &Server::ioInsecure, this );
    }
    else
    {
        lock.unlock();
        //m_xfr_mgr.start();
        m_maint_thread = new thread( &Server::backgroundMaintenance, this );
        m_msg_router_thread = new thread( &Server::msgRouter, this );
        m_io_secure_thread = new thread( &Server::ioSecure, this );
        //m_io_insecure_thread = new thread( &Server::ioInsecure, this );
        ioInsecure();
        //ioRun();
        lock.lock();
        m_io_running = false;
        m_router_cvar.notify_all();

        m_msg_router_thread->join();
        delete m_msg_router_thread;
        m_msg_router_thread = 0;

        m_maint_thread->join();
        delete m_maint_thread;
        m_maint_thread = 0;
    }
}


void
Server::stop( bool a_wait )
{
    // TODO This method is not being used currently
    (void)a_wait;
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
    {
#if 0
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

            m_msg_router_thread->join();
            delete m_msg_router_thread;
            m_msg_router_thread = 0;

            m_xfr_thread->join();
            delete m_xfr_thread;
            m_xfr_thread = 0;

            m_maint_thread->join();
            delete m_maint_thread;
            m_maint_thread = 0;
        }
#endif
    }
}


void
Server::wait()
{
    unique_lock<mutex> lock(m_api_mutex);

#if 0

    if ( m_io_running )
    {
        if ( m_io_thread )
        {
            m_io_thread->join();
            delete m_io_thread;

            m_io_thread = 0;
            m_io_running = false;

            m_msg_router_thread->join();
            delete m_msg_router_thread;
            m_msg_router_thread = 0;

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
#endif
}

/*
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
*/

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
        m_workers.push_back( new Worker( *this, t+1 ));

    // Connect backend to frontend via a proxy
    zmq_proxy_steerable( frontend, backend, 0, control );

    zmq_close( backend );
    zmq_close( control );

    // Clean-up workers
    vector<Worker*>::iterator iwrk;

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
        MsgComm frontend( "tcp://*:" + to_string(m_config.port), MsgComm::ROUTER, true, &m_sec_ctx );
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

/*
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
*/

void
Server::backgroundMaintenance()
{
    DL_DEBUG( "Maint thread started" );

    struct timespec             _t;
    double                      t;
    map<string,vector<pair<string,string>>>::iterator    del_iter;
    vector<pair<string,string>>::iterator    path_iter;
    Auth::RepoDataDeleteRequest       del_req;
    RecordDataLocation *        loc;
    Auth::RepoPathCreateRequest       path_create_req;
    Auth::RepoPathDeleteRequest       path_delete_req;
    MsgBuf::Message *           reply;
    MsgBuf::Frame               frame;
    map<string,pair<string,size_t>>::iterator itrans_client;
    map<string,MsgComm*>        repo_map;
    map<string,MsgComm*>::iterator repo;
    string path;

    try
    {
        // TODO Should not create connections to all repos, create on-demand, then close after a period of inactivity
        DL_INFO( "Confirming repository server connections" );
        for ( map<std::string,RepoData*>::iterator r = m_repos.begin(); r != m_repos.end(); r++ )
        {
            repo_map[r->first] = new MsgComm( r->second->address(), MsgComm::DEALER, false, &m_sec_ctx );
        }

        DL_INFO( "Starting repository control thread" );

        while( m_io_running )
        {
            sleep( MAINT_POLL_INTERVAL );

            lock_guard<mutex> lock( m_data_mutex );

            clock_gettime( CLOCK_REALTIME, &_t );
            t = _t.tv_sec + (_t.tv_nsec*1e-9);


            // Delete expired transient client credentials
            for ( itrans_client = m_trans_auth_clients.begin(); itrans_client != m_trans_auth_clients.end(); )
            {
                if ( itrans_client->second.second < t )
                {
                    DL_DEBUG( "Purging expired transient client " << itrans_client->second.first );
                    itrans_client = m_trans_auth_clients.erase( itrans_client );
                }
                else
                    itrans_client++;
            }

            // Process data deletion requests
            try
            {
                // TODO This needs to be re-written in an async manner
                // TODO Deletes also need to be serialized so they aren't lost in the event of a restart
                if ( m_data_delete.size() )
                {
                    cout << "server::backgroundMaintenance - data to delete!" << endl;

                    for ( del_iter = m_data_delete.begin(); del_iter != m_data_delete.end(); ++del_iter )
                    {
                        repo = repo_map.find( del_iter->first );
                        if ( repo != repo_map.end() )
                        {
                            del_req.clear_loc();
                            for ( path_iter = del_iter->second.begin(); path_iter != del_iter->second.end(); path_iter++ )
                            {
                                cout << "  del " << path_iter->first << endl;

                                loc = del_req.add_loc();
                                loc->set_id(path_iter->first);
                                loc->set_path(path_iter->second);
                            }

                            cout << "  send msg" << endl;

                            repo->second->send( del_req );
                            if ( !repo->second->recv( reply, frame, 10000 ))
                            {
                                cout << "  no response!" << endl;
                                DL_ERROR( "No response to data-delete req from " << repo->first );
                                break;
                            }
                            else
                                delete reply;
                        }
                        else
                        {
                            cout << "  bad repo " << del_iter->first << endl;

                            DL_ERROR( "Bad repo in delete list: " << del_iter->first );
                        }
                    }
                    m_data_delete.clear();
                }

                // TODO This needs to be re-written in an async manner, and be durable

                if ( m_path_create.size() )
                {
                    for ( path_iter = m_path_create.begin(); path_iter != m_path_create.end(); ++path_iter )
                    {
                        repo = repo_map.find( path_iter->first );
                        if ( repo != repo_map.end() )
                        {
                            path = m_repos[path_iter->first]->path() + ( path_iter->second[0]=='u'?"user/":"project/" )+ path_iter->second.substr(2);
                            DL_DEBUG( "Sending path-create to repo " << repo->first << " for path: " << path );
                            path_create_req.set_path( path );
                            repo->second->send( path_create_req );
                            if ( !repo->second->recv( reply, frame, 5000 ))
                            {
                                DL_ERROR( "No response to path-create req from " << repo->first << " for path: " << path_iter->second );
                                break;
                            }
                            else
                                delete reply;
                        }
                        else
                        {
                            DL_ERROR( "Bad repo in path create list: " << path_iter->first << ", for path " << path_iter->second );
                        }
                    }
                    m_path_create.clear();
                }

                if ( m_path_delete.size() )
                {
                    for ( path_iter = m_path_delete.begin(); path_iter != m_path_delete.end(); ++path_iter )
                    {
                        repo = repo_map.find( path_iter->first );
                        if ( repo != repo_map.end() )
                        {
                            path = m_repos[path_iter->first]->path() + ( path_iter->second[0]=='u'?"user/":"project/" )+ path_iter->second.substr(2);
                            DL_DEBUG( "Sending path-delete to repo " << repo->first << " for path: " << path );
                            path_delete_req.set_path( path );
                            repo->second->send( path_delete_req );
                            if ( !repo->second->recv( reply, frame, 5000 ))
                            {
                                DL_ERROR( "No response to path-delete req from " << repo->first << " for path: " << path_iter->second );
                                break;
                            }
                            else
                                delete reply;
                        }
                        else
                        {
                            DL_ERROR( "Bad repo in path delete list: " << path_iter->first << ", for path " << path_iter->second );
                        }
                    }
                    m_path_delete.clear();
                }
            }
            catch( TraceException & e )
            {
                DL_ERROR( "Maint thread proc-loop: " << e.toString() );
            }
            catch( exception & e )
            {
                DL_ERROR( "Maint thread proc-loop: " << e.what() );
            }
            catch( ... )
            {
                DL_ERROR( "Maint thread proc-loop: unkown exception " );
            }
        }
    }
    catch( TraceException & e )
    {
        DL_ERROR( "Maint thread: " << e.toString() );
    }
    catch( exception & e )
    {
        DL_ERROR( "Maint thread: " << e.what() );
    }
    catch( ... )
    {
        DL_ERROR( "Maint thread: unkown exception " );
    }

    for ( repo = repo_map.begin(); repo != repo_map.end(); repo++ )
        delete repo->second;

    DL_DEBUG( "Maint thread stopped" );
}

/*
void
Server::handleNewXfr( const XfrData & a_xfr )
{
    m_xfr_mgr.newXfr( a_xfr );
}


void
Server::dataDelete( const vector<RepoRecordDataLocations> & a_locs )
{
    cout << "server::dataDelete" << endl;
    int i;

    lock_guard<mutex> lock( m_data_mutex );

    for ( vector<RepoRecordDataLocations>::const_iterator r = a_locs.begin(); r != a_locs.end(); r++ )
    {
        if ( r->loc_size() > 0 )
        {
            cout << "  del " << r->loc_size() << " file(s)" << endl;
            vector<pair<string,string>> & locs = m_data_delete[r->repo_id()];
            for ( i = 0; i < r->loc_size(); i++ )
                locs.push_back( make_pair( r->loc(i).id(), r->loc(i).path() ));
        }
    }
}
*/

void
Server::zapHandler()
{
    DL_INFO( "ZAP handler thread starting" );
    
    try
    {
        void * ctx = MsgComm::getContext();

        char    client_key_text[41];
        void *  socket = zmq_socket( ctx, ZMQ_REP );
        int     rc;
        char    version[100];
        char    request_id[100];
        char    domain[100];
        char    address[100];
        char    identity_property[100];
        char    mechanism[100];
        char    client_key[100];
        map<string,string>::iterator iclient;
        map<string,pair<string,size_t>>::iterator itrans_client;
        zmq_pollitem_t poll_items[] = { socket, 0, ZMQ_POLLIN, 0 };
        string uid;
        DatabaseClient  db_client( m_config.db_url, m_config.db_user, m_config.db_pass );

        if (( rc = zmq_bind( socket, "inproc://zeromq.zap.01" )) == -1 )
            EXCEPT( 1, "Bind on ZAP failed." );

        while ( 1 )
        {
            try
            {
                if (( rc = zmq_poll( poll_items, 1, 2000 )) == -1 )
                    EXCEPT( 1, "Poll on ZAP socket failed." );

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
                else if (( itrans_client = m_trans_auth_clients.find( client_key_text )) != m_trans_auth_clients.end())
                {
                    uid = itrans_client->second.first;
                    DL_DEBUG( "ZAP: Known transient client connected: " << uid );
                }
                else
                {
                    if ( db_client.uidByPubKey( client_key_text, uid ) )
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

const std::string *
Server::getRepoAddress( const std::string & a_repo_id )
{
    map<string,RepoData*>::iterator r = m_repos.find( a_repo_id );
    if ( r != m_repos.end() )
        return &r->second->address(); // This is safe with current protobuf implementation
    else
        return 0;
}

void
Server::repoPathCreate( const std::string & a_repo_id, const std::string & a_id )
{
    map<string,RepoData*>::iterator r = m_repos.find( a_repo_id );
    if ( r != m_repos.end() )
    {
        lock_guard<mutex> lock( m_data_mutex );
        m_path_create.push_back( make_pair( a_repo_id, a_id ));
    }
}

void
Server::repoPathDelete( const std::string & a_repo_id, const std::string & a_id )
{
    map<string,RepoData*>::iterator r = m_repos.find( a_repo_id );
    if ( r != m_repos.end() )
    {
        lock_guard<mutex> lock( m_data_mutex );
        m_path_delete.push_back( make_pair( a_repo_id, a_id ));
    }
}

void
Server::authorizeClient( const std::string & a_cert_uid, const std::string & a_uid )
{
    if ( strncmp( a_cert_uid.c_str(), "anon_", 5 ) == 0 )
    {
        struct timespec             _t;

        lock_guard<mutex> lock( m_data_mutex );
        clock_gettime( CLOCK_REALTIME, &_t );

        m_trans_auth_clients[a_cert_uid.substr( 5 )] = make_pair<>( a_uid, _t.tv_sec + 30 );
    }
}


}}
