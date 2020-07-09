#include <algorithm>
#include <unistd.h>
#include "TraceException.hpp"
#include "DynaLog.hpp"
#include "DatabaseAPI.hpp"
#include "TaskMgr.hpp"
#include "TaskWorker.hpp"
#include "MsgComm.hpp"
#include "Config.hpp"
#include "SDMS.pb.h"
#include <libjson.hpp>

using namespace std;

namespace SDMS {
namespace Core {



TaskMgr::TaskMgr():
    m_config(Config::getInstance()),
    m_worker_next(0),
    m_maint_thread(0)
{
    TaskWorker *worker;

    m_maint_thread = new thread( &TaskMgr::maintenanceThread, this );

    unique_lock<mutex>   lock( m_worker_mutex );

    DL_DEBUG("TaskMgr creating " << m_config.num_task_worker_threads << " task worker threads." );

    for ( uint32_t i = 0; i < m_config.num_task_worker_threads; i++ )
    {
        worker = new TaskWorker( *this, i );
        if ( i )
        {
            m_workers.back()->m_next = worker;
        }

        m_workers.push_back( worker );
    }

    m_worker_next = m_workers.front();

    lock.unlock();

    // Load ready & running tasks and schedule workers
    DatabaseAPI  db( m_config.db_url, m_config.db_user, m_config.db_pass );
    libjson::Value tasks;
    db.taskLoadReady( tasks );
    newTasks( tasks );
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
    unique_lock<mutex>                      sched_lock( m_worker_mutex, defer_lock );
    unique_lock<mutex>                      maint_lock( m_maint_mutex );

    purgeTaskHistory();

    while( 1 )
    {
        // Default timeout is time until next purge
        timeout = purge_next;
        //DL_INFO( "MAINT: Next purge: " << chrono::duration_cast<chrono::seconds>( purge_next.time_since_epoch()).count() );
        //DL_INFO( "MAINT: tasks in retry queue: " << m_tasks_retry.size() );

        // Adjust timeout if a task retry should happen sooner
        t = m_tasks_retry.begin();
        if ( t != m_tasks_retry.end() )
        {
            //DL_INFO( "MAINT: Check next task retry: " << t->second->task_id );
            if ( t->first < purge_next )
            {
                timeout = t->first;
                //DL_INFO( "MAINT: timeout based on next retry: " << chrono::duration_cast<chrono::seconds>( t->first.time_since_epoch()).count() );
            }
        }

        DL_INFO( "MAINT: timeout: " << chrono::duration_cast<chrono::seconds>( timeout.time_since_epoch()).count() );

        if ( timeout > now )
        {
            m_maint_cvar.wait_until( maint_lock, timeout );
        }

        maint_lock.unlock();

        now = chrono::system_clock::now();

        if ( now >= purge_next )
        {
            purgeTaskHistory();

            now = chrono::system_clock::now();
            purge_next = now + purge_per;
        }

        maint_lock.lock();
        sched_lock.lock();

        // Reschedule tasks for retry
        DL_INFO( "MAINT: tasks in retry queue: " << m_tasks_retry.size() );

        //worker = m_worker_next;

        for ( t = m_tasks_retry.begin(); t != m_tasks_retry.end(); )
        {
            if ( t->first <= now )
            {
                DL_INFO( "MAINT: rescheduling failed task " << t->second->task_id );

                retryTaskAndScheduleWorker( t->second );
                t = m_tasks_retry.erase( t );
            }
            else
                break;
        }

        sched_lock.unlock();

        now = chrono::system_clock::now();
    }
}

void
TaskMgr::purgeTaskHistory() const
{
    DL_INFO( "TaskMgr: purging old task records." );

    try
    {
        DatabaseAPI  db( m_config.db_url, m_config.db_user, m_config.db_pass );

        db.taskPurge( m_config.task_purge_age );
    }
    catch ( TraceException & e )
    {
        DL_ERROR( "TaskMgr: purging failed - " << e.toString() );
    }
    catch (...)
    {
        DL_ERROR( "TaskMgr: purging failed - unknown exception." );
    }
}

/**
 * @brief Public method to add a new task to the "ready" queue
 * @param a_task - JSON task descriptor for NEW and READY task
 *
 * Adds task to ready queue and schedules a worker if available. Called by
 * ClientWorkers or other external entities.
 *
 * NOTE: Takes ownership of JSON value leaving a NULL value in place.
 */
void
TaskMgr::newTask( const std::string & a_task_id )
{
    DL_DEBUG("TaskMgr scheduling 1 new task");

    lock_guard<mutex> lock( m_worker_mutex );

    addNewTaskAndScheduleWorker( a_task_id );
}

/**
 * @brief Internal method to add one or more new tasks
 * 
 * @param a_tasks JSON array of task descriptors for NEW and READY tasks
 *
 * Adds task(s) to ready queue and schedules workers if available. Called by
 * TaskWorkers after finalizing a task returns new and/or unblocked tasks.
 *
 * NOTE: Takes ownership of JSON values leaving NULL values in place.
 */
void
TaskMgr::newTasks( const libjson::Value & a_tasks )
{
    try
    {
        const libjson::Value::Array & arr = a_tasks.asArray();
        libjson::Value::ArrayConstIter t = arr.begin();

        DL_DEBUG("TaskMgr scheduling " << arr.size() << "new task(s)");

        lock_guard<mutex> lock( m_worker_mutex );

        for ( ; t != arr.end(); t++ )
        {
            addNewTaskAndScheduleWorker( t->asString() );
        }
    }
    catch(...)
    {
        DL_ERROR("TaskMgr::newTasks - Bad task JSON returned from DB.");
    }
}


/**
 * @brief Private method to add task and schedule
 * 
 * @param a_task - JSON task descriptor
 *
 * NOTE: must be called with m_worker_mutex held by caller
 * NOTE: Takes ownership of JSON values leaving NULL values in place.
 */
void
TaskMgr::addNewTaskAndScheduleWorker( const std::string & a_task_id )
{
    // TODO Add logic to limit max number of ready tasks in memory

    m_tasks_ready.push_back( new Task( a_task_id ));

    if ( m_worker_next )
    {
        DL_DEBUG("Waking task worker " << m_worker_next->id() );
        m_worker_next->m_run = true;
        m_worker_next->m_cvar.notify_one();
        m_worker_next = m_worker_next->m_next?m_worker_next->m_next:0;
    }
}

void
TaskMgr::retryTaskAndScheduleWorker( Task * a_task )
{
    m_tasks_ready.push_back( a_task );

    if ( m_worker_next )
    {
        DL_DEBUG("Waking task worker " << m_worker_next->id() );
        m_worker_next->m_run = true;
        m_worker_next->m_cvar.notify_one();
        m_worker_next = m_worker_next->m_next?m_worker_next->m_next:0;
    }
}


void
TaskMgr::cancelTask( const std::string & a_task_id )
{
    DL_DEBUG("TaskMgr cancel task " << a_task_id );

    // TODO Implement task cancel

/*
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
*/
}

/**
 * @brief Get a ready task or block until one is available
 * @param a_worker - Task worker to receive task
 * @return Task instance
 *
 * Task workers call this method to get new tasks to process. If one
 * is available, it is returned directly; otherwise the worker is
 * descheduled until one becomes available.
 */
TaskMgr::Task *
TaskMgr::getNextTask( ITaskWorker * a_worker )
{
    Task * task = 0;

    unique_lock<mutex> lock( m_worker_mutex );

    if ( m_tasks_ready.empty() )
    {
        // No work right now, put worker at front of ready worker queue
        a_worker->m_run = false;
        a_worker->m_next = m_worker_next;
        m_worker_next = a_worker;

        // Sleep until work available, run flag suppresses spurious wakes
        while ( m_tasks_ready.empty() || !a_worker->m_run )
            a_worker->m_cvar.wait( lock );

        // No need to remove worker from ready queue, TaskMgr does that when worker is scheduled
    }

    // Pop next task from ready queue and place in running map
    task = m_tasks_ready.front();
    m_tasks_ready.pop_front();

    return task;
}


/**
 * @brief Submit a task with a transient failure for later retry
 * 
 * @param a_task - task to retry
 * @return true if task has expired and should be failed, false otherwise
 *
 * Called by task workers on transient failures.
 */
bool
TaskMgr::retryTask( Task * a_task )
{
    DL_DEBUG( "Retry task " << a_task->task_id );

    timepoint_t now = chrono::system_clock::now();

    if ( a_task->retry_count == 0 )
    {
        DL_DEBUG( "Retry first time" );

        a_task->retry_count++;
        a_task->retry_time = now + chrono::seconds( m_config.task_retry_time_init );
        a_task->retry_fail_time = now + chrono::seconds( m_config.task_retry_time_fail );

        DL_DEBUG( "Retry time " << chrono::duration_cast<chrono::seconds>( a_task->retry_time.time_since_epoch()).count() );
        DL_DEBUG( "Fail time " << chrono::duration_cast<chrono::seconds>( a_task->retry_fail_time.time_since_epoch()).count() );

        lock_guard<mutex> lock( m_maint_mutex );

        m_tasks_retry.insert( make_pair( a_task->retry_time, a_task ));
        m_maint_cvar.notify_one();
    }
    else if ( now < a_task->retry_fail_time )
    {
        DL_DEBUG( "Retry num " << a_task->retry_count );

        a_task->retry_count++;
        a_task->retry_time = now + chrono::seconds( m_config.task_retry_time_init * min( m_config.task_retry_backoff_max, a_task->retry_count ));

        DL_DEBUG( "New retry time " << chrono::duration_cast<chrono::seconds>( a_task->retry_time.time_since_epoch()).count() );

        lock_guard<mutex> lock(m_maint_mutex);

        m_tasks_retry.insert( make_pair( a_task->retry_time, a_task ));
        m_maint_cvar.notify_one();
    }
    else
    {
        DL_DEBUG( "Stopping retries" );
        return true;
    }

    return false;
}

}}
