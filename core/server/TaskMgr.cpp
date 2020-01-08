#include <algorithm>
#include <unistd.h>
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
    m_maint_thread(0)
{
    Worker *worker = 0;

    m_maint_thread = new thread( &TaskMgr::maintenanceThread, this );

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

/**
 * @brief Task background maintenance thread
 *
 * This thread is responsible for rescheduling failed tasks (due to transient
 * errors) and for periodically purging old tasks records from the database.
 */
void
TaskMgr::maintenanceThread()
{
    duration_t                              purge_per = chrono::seconds( m_config.task_purge_period );
    timepoint_t                             now = chrono::system_clock::now();
    timepoint_t                             purge_next = now + purge_per;
    timepoint_t                             timeout;
    multimap<timepoint_t,Task*>::iterator   t;
    unique_lock<mutex>                      lock( m_worker_mutex );

    while( 1 )
    {
        // Default timeout is time until next purge
        timeout = purge_next;
        DL_INFO( "MAINT: Next purge: " << timeout.time_since_epoch().count() );

        // Adjust timeout if a task retry should happen sooner
        t = m_tasks_retry.begin();
        if ( t != m_tasks_retry.end() )
        {
            DL_INFO( "MAINT: Next task retry: " << t->second->task_id << " at " << t->first.time_since_epoch().count() );
            if ( t->first < purge_next )
            {
                timeout = t->first;
                DL_INFO( "MAINT: timeout based on next retry: " << timeout.time_since_epoch().count() );
            }
        }

        DL_INFO( "MAINT: timeout for next event: " << timeout.time_since_epoch().count() );

        if ( timeout > now )
        {
            m_maint_cvar.wait_until( lock, timeout );
        }

        now = chrono::system_clock::now();

        if ( now >= purge_next )
        {
            // TODO Do purge
            DL_INFO( "MAINT: purging old task records." );

            //db_client.purgeTransferRecords( m_config.task_purge_age );

            now = chrono::system_clock::now();
            purge_next = now + purge_per;
        }

        // Reschedule tasks for retry
        for ( t = m_tasks_retry.begin(); t != m_tasks_retry.end(); )
        {
            if ( t->first <= now )
            {
                DL_INFO( "MAINT: rescheduling task " << t->second->task_id );
                m_tasks_ready.push_back( t->second );
                t = m_tasks_retry.erase( t );
            }
            else
                break;
        }

        now = chrono::system_clock::now();
    }
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

    if ( !m_tasks_ready.empty() )
    {
        task = m_tasks_ready.front();
        m_tasks_ready.pop_front();
        m_tasks_running[task->task_id] = task;
    }

    return task;
}


bool
TaskMgr::retryTask( Task * a_task )
{
    DL_DEBUG( "Retry task " << a_task->task_id );

    timepoint_t now = chrono::system_clock::now();

    if ( a_task->retry_count == 0 )
    {
        DL_DEBUG( "Retry first time" );

        a_task->retry_time = now + duration_t( m_config.task_retry_time_init );
        a_task->retry_fail_time = now + duration_t( m_config.task_retry_time_fail );

        lock_guard<mutex> lock(m_worker_mutex);

        m_tasks_retry.insert( make_pair( a_task->retry_time, a_task ));
        m_maint_cvar.notify_one();
    }
    else if ( a_task->retry_fail_time < now )
    {
        DL_DEBUG( "Retry num " << a_task->retry_count );

        a_task->retry_count++;
        a_task->retry_time = now + duration_t( m_config.task_retry_time_init * min( m_config.task_retry_backoff_max, a_task->retry_count ));

        lock_guard<mutex> lock(m_worker_mutex);

        m_tasks_retry.insert( make_pair( a_task->retry_time, a_task ));
        m_maint_cvar.notify_one();
    }
    else
    {
        DL_DEBUG( "Retry done" );
        return true;
    }

    return false;
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

        libjson::Value::Array & tasks = new_tasks.getArray();
        for ( libjson::Value::ArrayIter t = tasks.begin(); t != tasks.end(); t++ )
        {
            m_tasks_ready.push_back( new Task( (*t)["id"].asString(), *t ));
        }
    }
    catch( TraceException & e )
    {
        DL_ERROR("Exception in finalizeTask " << a_task->task_id << ": " << e.toString() );
    }
    catch( exception & e )
    {
        DL_ERROR("Exception in finalizeTask " << a_task->task_id << ": " << e.what() );
    }
    catch( ... )
    {
        DL_ERROR("Unknown exception in finalizeTask " << a_task->task_id );
    }

    m_tasks_running.erase( a_task->task_id );
    delete a_task;
}


void
TaskMgr::workerThread( Worker * worker )
{
    Task *              task;
    uint32_t            task_type;
    bool                success, retry;
    string              msg;

    DL_DEBUG( "Task worker " << worker->worker_id << " started." )

    unique_lock<mutex>  lock(m_worker_mutex);

    while( 1 )
    {
        worker->cvar.wait(lock);

        // Check for spurious wake...
        if ( m_tasks_ready.empty() )
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
                        retry = handleDataGet( worker, task );
                        break;
                    case TT_DATA_PUT:
                        retry = handleDataPut( worker, task );
                        break;
                    case TT_DATA_CHG_ALLOC:
                        retry = handleDataChangeAlloc( worker, task );
                        break;
                    case TT_DATA_CHG_OWNER:
                        retry = handleDataChangeOwner( worker, task );
                        break;
                    case TT_DATA_DEL:
                        retry = handleDataDelete( worker, task );
                        break;
                    default:
                        retry = false;
                        msg = "Invalid task type";
                        DL_ERROR( "Invalid task type (" << task_type << ") for task ID '" << task->task_id << "'" );
                        break;
                }

                success = true;
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

            if ( retry )
            {
                try
                {
                    DL_INFO("Do retry here");

                    if ( retryTask( task ))
                    {
                        DL_INFO("Retry time exceeded");
                        finalizeTask( worker->db, task, false, "Maximum task retry period exceeded." );
                    }
                }
                catch( ... )
                {
                    DL_ERROR( "Exception in retry code" );
                }
            }
            else
            {
                finalizeTask( worker->db, task, success, msg );
            }

            lock.lock();

            // If no more work, stop and go back to wait queue
            if ( m_tasks_ready.empty() )
                break;
        }

        // Add this worker back into pool of waiting workers
        if ( m_worker_next )
            m_worker_next->next = worker;
        else
            m_worker_next = worker;
    }
}


bool
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
    DL_DEBUG( "state: " << state.toString() );

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
                files_v.push_back(make_pair( (*f)["from"].asString( ), dst_path + (*f)["to"].asString() ));
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

    return false;
}


bool
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
    DL_DEBUG( "status: " << status << ", state: " << state.toString() );

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
        task->data["status"] = status;

        xfr_status = GlobusAPI::XS_INIT;
        state["xfr_status"] = xfr_status;
        upd_state["xfr_status"] = xfr_status;

        // Calculate encryption state
        encrypted = checkEncryption( encrypt, ep_info );
        state["xfr_status"] = encrypted;
        upd_state["encrypted"] = encrypted;
        string msg = "Running";

        DL_DEBUG( "Update task for running" );

        worker->db.taskUpdate( task->task_id, &status, &msg, 0, 0 );
    }
    else if ( status == TS_RUNNING )
    {
        DL_DEBUG( "Read state for already running task" );

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
        EXCEPT_PARAM( 1, "Task repo list size != 1, size: " << repos.size() );

    libjson::Value::ArrayIter   f;
    vector<pair<string,string>> files_v;
    string                      err_msg;

    libjson::Value::Object & repo = repos[0].getObject();
    libjson::Value::Array & files = repo["files"].getArray();
    libjson::Value::Object & file = files[0].getObject();

    if ( files.size() != 1 )
        EXCEPT_PARAM( 1, "Task file list size != 1, size: " << files.size() );

    // Initialize Globus transfer
    if ( xfr_status == GlobusAPI::XS_INIT )
    {
        upd_state.clear();

        files_v.push_back(make_pair( file.at( "from" ).asString( ), file.at( "to" ).asString() ));
        dst_ep = repo["repo_ep"].asString();

        DL_INFO( "dst_ep: " << dst_ep );

        worker->glob_task_id = worker->glob.transfer( src_ep, dst_ep, files_v, encrypted, worker->access_token );
        state["glob_task_id"] = worker->glob_task_id;
        upd_state["glob_task_id"] = worker->glob_task_id;

        xfr_status = GlobusAPI::XS_ACTIVE;
        state["xfr_status"] = xfr_status;
        upd_state["xfr_status"] = xfr_status;

        prog = 10.0;

        worker->db.taskUpdate( task->task_id, 0, 0, &prog, &upd_state );
    }

    if ( xfr_status < GlobusAPI::XS_SUCCEEDED )
    {
        // Monitor Globus transfer, throws on failure, kills task
        monitorTransfer( worker );

        DL_INFO( "Upload completed!" );

        // SUCCEEDED
        upd_state.clear();
        state["xfr_status"] = GlobusAPI::XS_SUCCEEDED;
        upd_state["xfr_status"] = GlobusAPI::XS_SUCCEEDED;

        prog = 90.0;

        DL_INFO( "Update task state & prog, " << state.toString() );

        worker->db.taskUpdate( task->task_id, 0, 0, &prog, &upd_state );
    }

    DL_INFO( "About to request size refresh" );

    // Request size from dst_repo
    if ( refreshDataSize( worker, string("repo/") + repo["repo_id"].asString(), file.at( "id" ).asString(), file.at( "to" ).asString( ), src_ep + file.at( "from" ).asString( ), state["ext"] ))
        return true;

    DL_INFO( "Updating task prog to 100%" );

    prog = 100.0;
    worker->db.taskUpdate( task->task_id, 0, 0, &prog, 0 );

    return false;
}


bool
TaskMgr::handleDataChangeAlloc( Worker *worker, Task * task )
{
    (void) worker;
    (void) task;
    DL_INFO( "Starting task " << task->task_id << ", type: DataChangeAlloc" );

    return false;
}


bool
TaskMgr::handleDataChangeOwner( Worker *worker, Task * task )
{
    (void) worker;
    (void) task;
    DL_INFO( "Starting task " << task->task_id << ", type: DataChangeOwner" );

    return false;
}


bool
TaskMgr::handleDataDelete( Worker *worker, Task * task )
{
    DL_INFO( "Starting task " << task->task_id << ", type: DataDelete" );

    string                      uid = task->data["user"].asString();
    TaskStatus                  status = (TaskStatus) task->data["status"].asNumber();
    double                      prog = 0;
    int                         repo_idx = 0;
    libjson::Value &            state = task->data["state"];
    libjson::Value::Array  &    repos = state["repos"].getArray();
    libjson::Value              upd_state;

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    worker->db.setClient( uid );

    upd_state.initObject();

    if ( status == TS_READY )
    {
        upd_state["repo_idx"] = 0;
        status = TS_RUNNING;
        string msg = "Running";
        worker->db.taskUpdate( task->task_id, &status, &msg, 0, &upd_state );
    }
    else if ( status == TS_RUNNING )
    {
        repo_idx = state["repo_idx"].asNumber();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << task->task_id << "' has invalid status: " << status );
    }

    libjson::Value::ArrayIter           f, r;
    string                              err_msg;
    Auth::RepoDataDeleteRequest         del_req;
    RecordDataLocation *                loc;
    MsgBuf::Message *                   reply;

    for ( r = repos.begin() + repo_idx; r != repos.end(); r++ )
    {
        libjson::Value::Object & repo = r->getObject();
        libjson::Value::Array & files = repo["files"].getArray();
        const string & repo_id = repo["repo_id"].asString();

        upd_state.clear();
        del_req.clear_loc();

        for ( f = files.begin(); f != files.end(); f++ )
        {
            loc = del_req.add_loc();
            loc->set_id( (*f)["id"].asString() );
            loc->set_id( (*f)["from"].asString() );
        }

        if ( repoSendRecv( repo_id, del_req, reply ))
            return true;

        delete reply;

        repo_idx++;
        upd_state["repo_idx"] = repo_idx;

        prog = 100.0*repo_idx/repos.size();
        worker->db.taskUpdate( task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
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


bool
TaskMgr::repoSendRecv( const string & a_repo_id, MsgBuf::Message & a_msg, MsgBuf::Message *& a_reply )
{
    map<string,RepoData*>::iterator rd = m_config.repos.find( a_repo_id );
    if ( rd == m_config.repos.end() )
        EXCEPT_PARAM( 1, "Task refers to non-existent repo server: " << a_repo_id );

    MsgComm comm( rd->second->address(), MsgComm::DEALER, false, &m_config.sec_ctx );

    comm.send( a_msg );

    MsgBuf buffer;

    if ( !comm.recv( buffer, false, 10000 ))
    {
        DL_ERROR( "Timeout waiting for size response from repo " << a_repo_id );
        cerr.flush();
        return true;
    }
    else
    {
        // Check for NACK
        a_reply = buffer.unserialize();

        Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( a_reply );
        if ( nack != 0 )
        {
            ErrorCode code = nack->err_code();
            string  msg = nack->has_err_msg()?nack->err_msg():"Unknown service error";

            delete a_reply;

            EXCEPT( code, msg );
        }

        return false;
    }
}

// TODO Add error handling
bool
TaskMgr::refreshDataSize( Worker * a_worker, const std::string & a_repo_id, const std::string & a_data_id, const std::string & a_data_path, const std::string & a_src_path, const libjson::Value & a_ext )
{
    time_t mod_time = time(0);
    size_t file_size = 1;

    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               raw_msg;

    loc = sz_req.add_loc();
    loc->set_id( a_data_id );
    loc->set_path( a_data_path );

    DL_INFO( "SendRecv msg to " << a_repo_id );

    if ( repoSendRecv( a_repo_id, sz_req, raw_msg ))
    {
        DL_INFO( "SendRecv failed, must retry" );

        return true;
    }

    DL_INFO( "SendRecv OK" );

    if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( raw_msg )) != 0 )
    {
        if ( sz_rep->size_size() == 1 )
            file_size = sz_rep->size(0).size();

        delete raw_msg;
    }
    else
    {
        delete raw_msg;
        EXCEPT_PARAM( 1, "Unexpected reply type from repo service: " << a_repo_id );
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
        upd_req.set_ext( a_ext.asString() );
        upd_req.set_ext_auto( false );
    }

    DL_INFO( "Updating record with new size" );

    a_worker->db.recordUpdate( upd_req, upd_reply, locs );

    return false;
}


}}
