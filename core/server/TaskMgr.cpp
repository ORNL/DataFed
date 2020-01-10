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
    m_worker_next(0),
    m_maint_thread(0)
{
    TaskWorker *worker;

    m_maint_thread = new thread( &TaskMgr::maintenanceThread, this );

    lock_guard<mutex>   lock(m_worker_mutex);

    DL_DEBUG("TaskMgr creating " << m_config.num_task_worker_threads << " task worker threads." );

    for ( uint32_t i = 0; i < m_config.num_task_worker_threads; i++ )
    {
        worker = new TaskWorker( *this, i );

        if ( i )
        {
            worker->m_prev = m_workers.back();
            worker->m_prev->m_next = worker;
        }

        m_workers.push_back( worker );
    }

    m_worker_next = m_workers.front();

    loadReadyTasks();
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
    TaskWorker *                            worker;

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
            // TODO Do purge
            DL_INFO( "MAINT: purging old task records." );

            //db_client.purgeTransferRecords( m_config.task_purge_age );

            now = chrono::system_clock::now();
            purge_next = now + purge_per;
        }

        maint_lock.lock();
        sched_lock.lock();

        // Reschedule tasks for retry
        DL_INFO( "MAINT: tasks in retry queue: " << m_tasks_retry.size() );

        worker = m_worker_next;

        for ( t = m_tasks_retry.begin(); t != m_tasks_retry.end(); )
        {
            if ( t->first <= now )
            {
                DL_INFO( "MAINT: rescheduling failed task " << t->second->task_id );

                m_tasks_ready.push_back( t->second );
                t = m_tasks_retry.erase( t );
                if ( worker )
                {
                    DL_DEBUG("Waking task worker " << worker->id() );
                    worker->wake();
                    worker = worker->m_next;
                }
            }
            else
                break;
        }

        sched_lock.unlock();

        now = chrono::system_clock::now();
    }
}


void
TaskMgr::loadReadyTasks()
{
    DL_DEBUG("TaskMgr loading ready tasks");

    libjson::Value  tasks;
    TaskWorker * worker = m_worker_next;
    DatabaseClient  db( m_config.db_url, m_config.db_user, m_config.db_pass );

    db.taskLoadReady( tasks );

    libjson::Value::Array & arr = tasks.getArray();

    DL_INFO( "Loaded " << arr.size() << " ready/running tasks" );

    for ( libjson::Value::ArrayIter t = arr.begin(); t != arr.end(); t++ )
    {
        m_tasks_ready.push_back( new Task( (*t)["id"].asString(), *t ));
        if ( worker )
        {
            DL_DEBUG("Waking task worker " << worker->id() );
            worker->wake();
            worker = worker->m_next;
        }
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
        DL_DEBUG("Waking task worker " << m_worker_next->id() );
        m_worker_next->wake();
    }
}


void
TaskMgr::newTasks( libjson::Value & a_tasks )
{
    DL_DEBUG("TaskMgr adding new task(s)");

    libjson::Value::Array & arr = a_tasks.getArray();
    libjson::Value::ArrayIter t = arr.begin();

    lock_guard<mutex> lock( m_worker_mutex );

    for ( ; t != arr.end(); t++ )
    {
        m_tasks_ready.push_back( new Task( a_task["id"].asString(), a_task ));
        wakeNextWorker();
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


TaskMgr::Task *
TaskMgr::getNextTask( TaskWorker * a_worker )
{
    Task * task = 0;

    unique_lock<mutex> lock( m_worker_mutex );

    if ( m_tasks_ready.empty() )
    {
        // Put worker at front of ready worker queue
        a_worker->m_next = m_worker_next;
        m_worker_next = a_worker;

        // Sleep until work available
        while ( m_tasks_ready.empty() )
            a_worker->sleep( lock );

        // Remove worker from ready queue
        //m_tasks_ready.erase( t );
    }

    // Pop next task from ready queue and place in running map
    task = m_tasks_ready.front();
    m_tasks_ready.pop_front();
    //m_tasks_running[task->task_id] = task;

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
