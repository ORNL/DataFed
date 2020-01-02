#include <curl/curl.h>
#include "TraceException.hpp"
#include "DynaLog.hpp"
#include "TaskMgr.hpp"
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

    vector<libjson::Value> new_tasks;

    try
    {
        a_db.taskFinalize( a_task->task_id, a_succeeded, a_msg, new_tasks );

        DL_DEBUG("found " << new_tasks.size() << " new tasks." );

        lock_guard<mutex> lock(m_worker_mutex);

        m_tasks_running.erase( a_task->task_id );
        delete a_task;

        for ( vector<libjson::Value>::iterator t = new_tasks.begin(); t != new_tasks.end(); t++ )
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

    string                      dst_ep, dst_path, acc_tok;
    bool                        encrypted = false;
    GlobusAPI::EndpointInfo     ep_info;
    string                      uid = task->data["user"].asString();
    TaskStatus                  status = task->data["status"].asNumber();
    double                      prog = 10;
    libjson::Value &            state = task->data["state"];
    uint32_t                    encrypt = state["encrypt"].asNumber();
    libjson::Value::Object &    repos = state["repos"].getObject();
    libjson::Value              upd_state;
    size_t                      repo_idx = state["repo_idx"].asNumber();

    DL_INFO("state: " << state.toString( ));

    worker->db.setClient( uid );

    upd_state.initObject();

    if ( status == TS_READY )
    {
        status = TS_RUNNING;
        worker->db.taskUpdate( task->task_id, &status, 0, 0 );
    }

    acc_tok = getUserAccessToken( worker, uid );

    // Check destination endpoint

    dst_ep = state.at( "dst_ep" ).asString();
    dst_path = state.at( "dst_path" ).asString();

    worker->glob.getEndpointInfo( dst_ep, acc_tok, ep_info );

    if ( !ep_info.activated )
        EXCEPT(1,"Remote endpoint requires activation.");

    // TODO Notify if activation expiring soon

    // Determine encryption state
    if ( repo_idx == 0 )
    {
        switch ( encrypt )
        {
            case ENCRYPT_NONE:
                if ( ep_info.force_encryption )
                    EXCEPT(1,"Remote endpoint requires encryption.");
                encrypted = false;
                break;
            case ENCRYPT_AVAIL:
                if ( ep_info.supports_encryption )
                    encrypted = true;
                else
                    encrypted = false;
                break;
            case ENCRYPT_FORCE:
                if ( !ep_info.supports_encryption )
                    EXCEPT(1,"Remote endpoint does not support encryption.");
                encrypted = true;
                break;
        }

        upd_state["encrypted"] = encrypted;
    }

    // Setup a transfer for current repo index
    if ( repo_idx >= repos.size() )
        EXCEPT(1,"Task repo_idx (" << repo_idx << ") out of range (max: " << repos.size() << ")");

    libjson::Value::ObjectIter r = repos.begin() + repo_idx;

    for ( ; r != repos.end(); r++ )
    {
        libjson::Value::Object & repo = r->second.getObject();

        DL_INFO("repo: " << r->first);

        //worker->glob.transfer( (*ixfr)->xfr, acc_token );

        worker->db.taskUpdate( task->task_id, 0, &prog, &upd_state );
    }

}


void
TaskMgr::handleDataPut( Worker *worker, Task * task )
{
    DL_INFO( "Starting task " << task->task_id << ", type: DataPut" );
}


void
TaskMgr::handleDataChangeAlloc( Worker *worker, Task * task )
{
    DL_INFO( "Starting task " << task->task_id << ", type: DataChangeAlloc" );
}


void
TaskMgr::handleDataChangeOwner( Worker *worker, Task * task )
{
    DL_INFO( "Starting task " << task->task_id << ", type: DataChangeOwner" );
}


void
TaskMgr::handleDataDelete( Worker *worker, Task * task )
{
    DL_INFO( "Starting task " << task->task_id << ", type: DataDelete" );
}


std::string
TaskMgr::getUserAccessToken( Worker * a_worker, const std::string & a_uid )
{
    string acc_tok, ref_tok;
    uint32_t expires_in;

    a_worker->db.userGetAccessToken( acc_tok, ref_tok, expires_in );

    if ( expires_in < 300 )
    {
        DL_INFO( "Refreshing access token for " << a_uid );

        a_worker->glob.refreshAccessToken( ref_tok, acc_tok, expires_in );
        a_worker->db.userSetAccessToken( acc_tok, expires_in, ref_tok );
    }

    return acc_tok;
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
