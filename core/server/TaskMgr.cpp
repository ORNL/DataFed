#include <unistd.h>
#include <curl/curl.h>
#include "TraceException.hpp"
#include "DynaLog.hpp"
#include "TaskMgr.hpp"
#include "MsgComm.hpp"
#include "Config.hpp"
#include "SDMS.pb.h"
#include <libjson.hpp>

using namespace std;

namespace SDMS {
namespace Core {



TaskMgr::TaskMgr():
    m_config(Config::getInstance()),
    m_main_thread(0)
{
    //m_main_thread = new thread( &TaskMgr::mainThread, this );
    Worker *worker = 0;

    lock_guard<mutex>   lock(m_worker_mutex);

    DL_DEBUG("TaskMgr creating " << m_config.num_task_worker_threads << " task worker threads." );

    for ( uint32_t i = 0; i < m_config.num_task_worker_threads; i++ )
    {
        worker = new Worker(i);
        worker->thread = new thread( &TaskMgr::workerThread, this, worker );

        if ( i )
            m_workers.back()->next = worker;

        m_workers.push_back( worker );
    }

    m_worker_next = m_workers.front();
}

TaskMgr::~TaskMgr()
{
}

TaskMgr &
TaskMgr::getInstance()
{
    static TaskMgr * mgr = new TaskMgr();

    return *mgr;
}


void
TaskMgr::newTask( libjson::Value & a_task )
{
    DL_DEBUG("TaskMgr adding new task");

    lock_guard<mutex> lock( m_worker_mutex );

    m_tasks_ready.push_back( new Task( a_task["id"].asString(), a_task ));

    if ( m_worker_next )
    {
        DL_DEBUG("Waking task worker " << m_worker_next->worker_id );
        m_worker_next->cvar.notify_one();
    }
}


void
TaskMgr::cancelTask( const std::string & a_task_id )
{
    DL_DEBUG("TaskMgr cancel task " << a_task_id );

    unique_lock<mutex> lock( m_worker_mutex );

    map<string,Task*>::iterator t = m_tasks_running.find( a_task_id );

    if ( t != m_tasks_running.end() )
    {
        t->second->cancel = true;
    }
    else
    {
        for ( deque<Task*>::iterator t = m_tasks_ready.begin(); t != m_tasks_ready.end(); t++ )
        {
            if ( (*t)->task_id == a_task_id )
            {
                Task * task = *t;
                m_tasks_ready.erase( t );

                lock.unlock();

                DatabaseClient  db( m_config.db_url , m_config.db_user, m_config.db_pass );

                finalizeTask( db, task, false, "Cancelled" );

                break;
            }
        }
    }
}


TaskMgr::Task *
TaskMgr::getNextTask()
{
    Task * task = 0;

    if ( !m_tasks_ready.empty( ))
    {
        task = m_tasks_ready.front();
        m_tasks_ready.pop_front();
        m_tasks_running[task->task_id] = task;
    }

    return task;
}


void
TaskMgr::finalizeTask( DatabaseClient & a_db, Task * a_task, bool a_succeeded, const std::string & a_msg )
{
    DL_DEBUG("TaskMgr finalizeTask " << a_task->task_id );

    libjson::Value new_tasks;

    try
    {
        a_db.taskFinalize( a_task->task_id, a_succeeded, a_msg, new_tasks );

        DL_DEBUG("found " << new_tasks.size() << " new ready tasks." );

        lock_guard<mutex> lock(m_worker_mutex);

        m_tasks_running.erase( a_task->task_id );
        delete a_task;

        libjson::Value::Array & tasks = new_tasks.getArray();
        for ( libjson::Value::ArrayIter t = tasks.begin(); t != tasks.end(); t++ )
        {
            m_tasks_ready.push_back( new Task( (*t)["id"].asString(), *t ));
        }
    }
    catch( TraceException & e )
    {
        DL_ERROR("Exception in finalizeTask " << a_task->task_id << ": " << e.toString( ));
    }
    catch( exception & e )
    {
        DL_ERROR("Exception in finalizeTask " << a_task->task_id << ": " << e.what( ));
    }
    catch( ... )
    {
        DL_ERROR("Unknown exception in finalizeTask " << a_task->task_id );
    }
}


void
TaskMgr::workerThread( Worker * worker )
{
    Task *              task;
    uint32_t            task_type;
    bool                success;
    string              msg;

    DL_DEBUG( "Task worker " << worker->worker_id << " started." )

    unique_lock<mutex>  lock(m_worker_mutex);

    while( 1 )
    {
        worker->cvar.wait(lock);

        // Check for spurious wake...
        if ( m_tasks_ready.empty( ))
            continue;

        // Check for out-of-order wake... (not sure this can happen, spurious wake?)
        if ( m_worker_next != worker )
        {
            DL_ERROR( "Task worker " << worker->worker_id << " notified out of order!" )
            continue;
        }

        m_worker_next = worker->next;
        worker->next = 0;

        while( 1 )
        {
            task = getNextTask();

            lock.unlock();

            DL_DEBUG("Task worker " << worker->worker_id << " handling new task " << task->task_id );

            try
            {
                // Dispatch task to handler method
                success = false;

                task_type = task->data["type"].asNumber();
                switch( task_type )
                {
                    case TT_DATA_GET:
                        handleDataGet( worker, task );
                        break;
                    case TT_DATA_PUT:
                        handleDataPut( worker, task );
                        break;
                    case TT_DATA_CHG_ALLOC:
                        handleDataChangeAlloc( worker, task );
                        break;
                    case TT_DATA_CHG_OWNER:
                        handleDataChangeOwner( worker, task );
                        break;
                    case TT_DATA_DEL:
                        handleDataDelete( worker, task );
                        break;
                    default:
                        DL_ERROR( "Invalid task type (" << task_type << ") for task ID '" << task->task_id << "'" );
                        break;
                }

                // Do work

                success = true;
                msg = "";
            }
            catch( TraceException & e )
            {
                DL_ERROR( "Task handler error,  worker " << worker->worker_id );
                msg = e.toString( );
            }
            catch( exception & e )
            {
                DL_ERROR( "Task handler error, worker " << worker->worker_id );
                msg = e.what();
            }

            finalizeTask( worker->db, task, success, msg );

            lock.lock();

            // If no more work, stop and go back to wait queue
            if ( m_tasks_ready.empty( ))
                break;
        }

        // Add this worker back into pool of waiting workers
        if ( m_worker_next )
            m_worker_next->next = worker;
        else
            m_worker_next = worker;
    }
}


void
TaskMgr::handleDataGet( Worker *worker, Task * task )
{
    DL_INFO( "Starting task '" << task->task_id << "', type: DataGet" );

    string                      src_repo_ep;
    bool                        encrypted = false;
    GlobusAPI::EndpointInfo     ep_info;
    string                      uid = task->data["user"].asString();
    TaskStatus                  status = (TaskStatus) task->data["status"].asNumber();
    GlobusAPI::XfrStatus        xfr_status;
    double                      prog = 0;
    libjson::Value &            state = task->data["state"];
    Encryption                  encrypt = (Encryption)state["encrypt"].asNumber();
    libjson::Value::Array  &    repos = state["repos"].getArray();
    libjson::Value              upd_state;
    size_t                      repo_idx = 0;
    string                      dst_ep = state["dst_ep"].asString();
    string                      dst_path = state["dst_path"].asString();

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString( ));

    worker->db.setClient( uid );
    getUserAccessToken( worker, uid );

    // Check destination endpoint
    worker->glob.getEndpointInfo( dst_ep, worker->access_token, ep_info );
    if ( !ep_info.activated )
        EXCEPT_PARAM( 1, "Remote endpoint " << dst_ep << " requires activation." );

    // TODO Notify if dst ep activation expiring soon

    upd_state.initObject();

    if ( status == TS_READY )
    {
        // Initialize state

        status = TS_RUNNING;
        upd_state["repo_idx"] = 0;
        xfr_status = GlobusAPI::XS_INIT;
        upd_state["xfr_status"] = GlobusAPI::XS_INIT;
        // TODO Limit number of records transferred per globus request

        // Calculate encryption state
        encrypted = checkEncryption( encrypt, ep_info );

        upd_state["encrypted"] = encrypted;
        string msg = "Running";
        worker->db.taskUpdate( task->task_id, &status, &msg, 0, 0 );
    }
    else if ( status == TS_RUNNING )
    {
        // Load state

        repo_idx = state["repo_idx"].asNumber();
        encrypted = state["encrypted"].asBool();
        xfr_status = (GlobusAPI::XfrStatus) state["xfr_status"].asNumber();
        if ( xfr_status > GlobusAPI::XS_INIT )
            worker->glob_task_id = state["glob_task_id"].asString();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << task->task_id << "' has invalid status: " << status );
    }

    if ( repo_idx >= repos.size() )
        EXCEPT_PARAM( 1, "Task repo_idx (" << repo_idx << ") out of range (max: " << repos.size() << ")" );

    libjson::Value::ArrayIter   f, r;
    vector<pair<string,string>> files_v;
    string                      err_msg;

    for ( r = repos.begin() + repo_idx; r != repos.end(); r++ )
    {
        libjson::Value::Object & repo = r->getObject();

        // Initialize Globus transfer
        if ( xfr_status == GlobusAPI::XS_INIT )
        {
            libjson::Value::Array & files = repo["files"].getArray();

            upd_state.clear();
            files_v.clear();

            for ( f = files.begin(); f != files.end(); f++ )
            {
                files_v.push_back(make_pair( (*f)["from"].asString( ), dst_path + (*f)["to"].asString( )));
            }

            src_repo_ep = repo["repo_ep"].asString();

            DL_INFO( "src_repo_ep: " << src_repo_ep );

            worker->glob_task_id = worker->glob.transfer( src_repo_ep, dst_ep, files_v, encrypted, worker->access_token );

            xfr_status = GlobusAPI::XS_ACTIVE;
            upd_state["glob_task_id"] = worker->glob_task_id;
            upd_state["xfr_status"] = xfr_status;
            prog = 100.0*(repo_idx + .5)/repos.size();

            worker->db.taskUpdate( task->task_id, 0, 0, &prog, &upd_state );
        }

        // Monitor Globus transfer
        monitorTransfer( worker );

        // Xfr SUCCEEDED
        upd_state.clear();
        upd_state["xfr_status"] = xfr_status;
        prog = 100.0*(repo_idx + 1)/repos.size();
        worker->db.taskUpdate( task->task_id, 0, 0, &prog, &upd_state );

        repo_idx++;
        xfr_status = GlobusAPI::XS_INIT;
    }
}


void
TaskMgr::handleDataPut( Worker *worker, Task * task )
{
    DL_INFO( "Starting task " << task->task_id << ", type: DataPut" );

    string                      dst_ep;
    bool                        encrypted = false;
    GlobusAPI::EndpointInfo     ep_info;
    string                      uid = task->data["user"].asString();
    TaskStatus                  status = (TaskStatus) task->data["status"].asNumber();
    GlobusAPI::XfrStatus        xfr_status;
    double                      prog = 0;
    libjson::Value &            state = task->data["state"];
    Encryption                  encrypt = (Encryption)state["encrypt"].asNumber();
    libjson::Value::Array  &    repos = state["repos"].getArray();
    libjson::Value              upd_state;
    string                      src_ep = state["src_ep"].asString();
    string                      src_path = state["src_path"].asString();

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString( ));

    worker->db.setClient( uid );
    getUserAccessToken( worker, uid );

    // Check destination endpoint
    worker->glob.getEndpointInfo( src_ep, worker->access_token, ep_info );
    if ( !ep_info.activated )
        EXCEPT_PARAM( 1, "Remote endpoint " << dst_ep << " requires activation." );

    // TODO Notify if dst ep activation expiring soon

    upd_state.initObject();

    if ( status == TS_READY )
    {
        status = TS_RUNNING;
        xfr_status = GlobusAPI::XS_INIT;
        upd_state["xfr_status"] = GlobusAPI::XS_INIT;

        // Calculate encryption state
        encrypted = checkEncryption( encrypt, ep_info );

        upd_state["encrypted"] = encrypted;
        string msg = "Running";
        worker->db.taskUpdate( task->task_id, &status, &msg, 0, 0 );
    }
    else if ( status == TS_RUNNING )
    {
        encrypted = state["encrypted"].asBool();
        xfr_status = (GlobusAPI::XfrStatus) state["xfr_status"].asNumber();
        if ( xfr_status > GlobusAPI::XS_INIT )
            worker->glob_task_id = state["glob_task_id"].asString();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << task->task_id << "' has invalid status: " << status );
    }


    if ( repos.size() != 1 )
        EXCEPT_PARAM( 1, "Task repo list size != 1, size: " << repos.size( ));

    libjson::Value::ArrayIter   f;
    vector<pair<string,string>> files_v;
    string                      err_msg;

    libjson::Value::Object & repo = repos[0].getObject();
    libjson::Value::Array & files = repo["files"].getArray();
    libjson::Value::Object & file = files[0].getObject();

    if ( files.size() != 1 )
        EXCEPT_PARAM( 1, "Task file list size != 1, size: " << files.size( ));

    // Initialize Globus transfer
    if ( xfr_status == GlobusAPI::XS_INIT )
    {
        upd_state.clear();

        files_v.push_back(make_pair( file.at( "from" ).asString( ), file.at( "to" ).asString( )));

        dst_ep = repo["repo_ep"].asString();

        DL_INFO( "dst_ep: " << dst_ep );

        worker->glob_task_id = worker->glob.transfer( src_ep, dst_ep, files_v, encrypted, worker->access_token );

        xfr_status = GlobusAPI::XS_ACTIVE;
        upd_state["glob_task_id"] = worker->glob_task_id;
        upd_state["xfr_status"] = xfr_status;
        prog = 10.0;

        worker->db.taskUpdate( task->task_id, 0, 0, &prog, &upd_state );
    }

    if ( xfr_status < GlobusAPI::XS_SUCCEEDED )
    {
        // Monitor Globus transfer
        monitorTransfer( worker );

        // SUCCEEDED
        upd_state.clear();
        upd_state["xfr_status"] = GlobusAPI::XS_SUCCEEDED;
        prog = 90.0;
        worker->db.taskUpdate( task->task_id, 0, 0, &prog, &upd_state );
    }

    // Request size from dst_repo
    refreshDataSize( worker, string("repo/") + repo["repo_id"].asString(), file.at( "id" ).asString(), file.at( "to" ).asString( ), src_ep + file.at( "from" ).asString( ), state["ext"] );

/*
    time_t mod_time = time(0);
    size_t file_size = 1;
    string dst_repo_id = string("repo/") + repo["repo_id"].asString();
    string data_id = file.at( "id" ).asString();

    map<string,RepoData*>::iterator rd = m_config.repos.find( dst_repo_id );

    if ( rd == m_config.repos.end( ))
        EXCEPT_PARAM( 1, "Task refers to non-existent repo server: " << dst_repo_id );

    MsgComm comm( rd->second->address(), MsgComm::DEALER, false, &m_config.sec_ctx );

    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               raw_msg;
    MsgBuf::Frame                   frame;

    loc = sz_req.add_loc();
    loc->set_id( data_id );
    loc->set_path( file.at( "to" ).asString( ));

    comm.send( sz_req );
    if ( !comm.recv( raw_msg, frame, 600000 ))
    {
        DL_ERROR( "Timeout waiting for size response from repo " << dst_repo_id );
    }
    else
    {
        if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( raw_msg )) != 0 )
        {
            if ( sz_rep->size_size() == 1 )
                file_size = sz_rep->size(0).size();
        }

        delete raw_msg;
    }

    // Update DB record with new file stats
    Auth::RecordUpdateRequest       upd_req;
    Auth::RecordDataReply           upd_reply;
    vector<RepoRecordDataLocations> locs; // Not used, be required by DB api

    upd_req.set_id( data_id );
    upd_req.set_size( file_size );
    upd_req.set_dt( mod_time );
    upd_req.set_source( src_ep + file.at( "from" ).asString( ));
    if ( state.has( "ext" ))
    {
        upd_req.set_ext( state["ext"].asString( ));
        upd_req.set_ext_auto( false );
    }

    worker->db.recordUpdate( upd_req, upd_reply, locs );
*/

    prog = 100.0;
    worker->db.taskUpdate( task->task_id, 0, 0, &prog, 0 );
}


void
TaskMgr::handleDataChangeAlloc( Worker *worker, Task * task )
{
    (void) worker;
    (void) task;
    DL_INFO( "Starting task " << task->task_id << ", type: DataChangeAlloc" );
}


void
TaskMgr::handleDataChangeOwner( Worker *worker, Task * task )
{
    (void) worker;
    (void) task;
    DL_INFO( "Starting task " << task->task_id << ", type: DataChangeOwner" );
}


void
TaskMgr::handleDataDelete( Worker *worker, Task * task )
{
    (void) worker;
    (void) task;
    DL_INFO( "Starting task " << task->task_id << ", type: DataDelete" );
}


void
TaskMgr::getUserAccessToken( Worker * a_worker, const std::string & a_uid )
{
    string      ref_tok;
    uint32_t    expires_in;

    a_worker->db.userGetAccessToken( a_worker->access_token, ref_tok, expires_in );

    if ( expires_in < 300 )
    {
        DL_INFO( "Refreshing access token for " << a_uid );

        a_worker->glob.refreshAccessToken( ref_tok, a_worker->access_token, expires_in );
        a_worker->db.userSetAccessToken( a_worker->access_token, expires_in, ref_tok );
    }
}


bool
TaskMgr::checkEncryption( Encryption a_encrypt, const GlobusAPI::EndpointInfo & a_ep_info )
{
    switch ( a_encrypt )
    {
        case ENCRYPT_NONE:
            if ( a_ep_info.force_encryption )
                EXCEPT(1,"Remote endpoint requires encryption.");
            return false;
        case ENCRYPT_AVAIL:
            if ( a_ep_info.supports_encryption )
                return true;
            else
                return false;
        case ENCRYPT_FORCE:
            if ( !a_ep_info.supports_encryption )
                EXCEPT(1,"Remote endpoint does not support encryption.");
            return true;
        default:
            EXCEPT(1,"Invalid transfer encryption value.");
    }

    // compiler warns, but can't get here
    return false;
}


void
TaskMgr::monitorTransfer( Worker *worker )
{
    GlobusAPI::XfrStatus    xfr_status;
    string                  err_msg;

    while( 1 )
    {
        sleep( 5 );

        if ( worker->glob.checkTransferStatus( worker->glob_task_id, worker->access_token, xfr_status, err_msg ))
        {
            // Transfer task needs to be cancelled
            worker->glob.cancelTask( worker->glob_task_id, worker->access_token );
        }

        if ( xfr_status == GlobusAPI::XS_FAILED )
        {
            // err_msg will be set by checkTransferStatus on failure
            EXCEPT( 1, err_msg );
        }
        else if ( xfr_status == GlobusAPI::XS_SUCCEEDED )
        {
            break;
        }
    }
}

void
TaskMgr::refreshDataSize( Worker * a_worker, const std::string & a_repo_id, const std::string & a_data_id, const std::string & a_data_path, const std::string & a_src_path, const libjson::Value & a_ext )
{
    time_t mod_time = time(0);
    size_t file_size = 1;

    map<string,RepoData*>::iterator rd = m_config.repos.find( a_repo_id );

    if ( rd == m_config.repos.end( ))
        EXCEPT_PARAM( 1, "Task refers to non-existent repo server: " << a_repo_id );

    MsgComm comm( rd->second->address(), MsgComm::DEALER, false, &m_config.sec_ctx );

    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               raw_msg;
    MsgBuf::Frame                   frame;

    loc = sz_req.add_loc();
    loc->set_id( a_data_id );
    loc->set_path( a_data_path );

    comm.send( sz_req );
    if ( !comm.recv( raw_msg, frame, 600000 ))
    {
        DL_ERROR( "Timeout waiting for size response from repo " << a_repo_id );
    }
    else
    {
        if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( raw_msg )) != 0 )
        {
            if ( sz_rep->size_size() == 1 )
                file_size = sz_rep->size(0).size();
        }

        delete raw_msg;
    }

    // Update DB record with new file stats
    Auth::RecordUpdateRequest       upd_req;
    Auth::RecordDataReply           upd_reply;
    vector<RepoRecordDataLocations> locs; // Not used, be required by DB api

    upd_req.set_id( a_data_id );
    upd_req.set_size( file_size );
    upd_req.set_dt( mod_time );
    upd_req.set_source( a_src_path );
    if ( a_ext.isString() )
    {
        upd_req.set_ext( a_ext.asString( ));
        upd_req.set_ext_auto( false );
    }

    a_worker->db.recordUpdate( upd_req, upd_reply, locs );
}

/*
void
TaskMgr::transferData( XfrDataReply & a_reply )
{
    for ( int i = 0; i < a_reply.xfr_size(); i++ )
    {
        Task * task = new TaskXfr( a_reply.xfr( i ));
        lock_guard<mutex> lock(m_mutex);
        m_q_ready.push_front( task );
    }
}



void
TaskMgr::deleteData( const std::vector<std::string> & a_ids )
{
}
*/


void
TaskMgr::mainThread()
{
    CURLM * curlm = curl_multi_init();

    while( 1 )
    {

    }

    curl_multi_cleanup( curlm );
}


/*
void
TaskMgr::httpInit( Task & a_task, bool a_post, const std::string & a_url_base, const std::string & a_url_path, const std::string & a_token, const url_params_t & a_params, const rapidjson::Document * a_body )
{
    a_task.curl = curl_easy_init();

    if ( !a_task.curl )
        EXCEPT( 1, "curl_easy_init failed" );

    curl_easy_setopt( a_task.curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( a_task.curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
    curl_easy_setopt( a_task.curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( a_task.curl, CURLOPT_TCP_NODELAY, 1 );

    string  url;
    char *  esc_txt;
    char    error[CURL_ERROR_SIZE];
    error[0] = 0;

    url.reserve( 512 );
    url.append( a_base_url );

    esc_txt = curl_easy_escape( a_task.curl, a_url_path.c_str(), 0 );
    url.append( esc_txt );
    curl_free( esc_txt );

    for ( vector<pair<string,string>>::const_iterator iparam = a_params.begin(); iparam != a_params.end(); ++iparam )
    {
        if ( iparam == a_params.begin())
            url.append( "?" );
        else
            url.append( "&" );
        url.append( iparam->first.c_str() );
        url.append( "=" );
        esc_txt = curl_easy_escape( a_task.curl, iparam->second.c_str(), 0 );
        url.append( esc_txt );
        curl_free( esc_txt );
    }

    //curl_easy_setopt( a_task.curl, CURLOPT_VERBOSE, 1 );
    curl_easy_setopt( a_task.curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( a_task.curl, CURLOPT_WRITEDATA, &a_task.result );
    curl_easy_setopt( a_task.curl, CURLOPT_ERRORBUFFER, error );

    if ( a_post )
        curl_easy_setopt( a_task.curl, CURLOPT_POST, 1 );
    else
        curl_easy_setopt( a_task.curl, CURLOPT_HTTPGET, 1 );

    if ( a_body )
    {
        rapidjson::StringBuffer buffer;
        rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
        a_body->Accept(writer);
        curl_easy_setopt( a_task.curl, CURLOPT_POSTFIELDS, buffer.GetString( ));
    }
    else
        curl_easy_setopt( a_task.curl, CURLOPT_POSTFIELDS, "" );

    a_task.list = 0;

    if ( a_token.size() )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        a_task.list = curl_slist_append( a_task.list, auth_hdr.c_str( ));
    }
    else
    {
        curl_easy_setopt( a_task.curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC );
        curl_easy_setopt( a_task.curl, CURLOPT_USERNAME, m_config.client_id.c_str() );
        curl_easy_setopt( a_task.curl, CURLOPT_PASSWORD, m_config.client_secret.c_str() );
    }

    if ( a_body )
    {
        a_task.list = curl_slist_append( a_task.list, "Content-Type: application/json");
    }

    if ( a_task.list )
        curl_easy_setopt( a_task.curl, CURLOPT_HTTPHEADER, a_task.list );

    //CURLcode res = curl_easy_perform( m_curl );

    //if ( list )
    //    curl_slist_free_all(list);
}
*/


}}
