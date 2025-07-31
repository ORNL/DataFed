
// Local private includes
#include "TaskMgr.hpp"
#include "Config.hpp"
#include "DatabaseAPI.hpp"
#include "TaskWorker.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/SDMS.pb.h"
#include "common/TraceException.hpp"
#include "common/libjson.hpp"

// Standard includes
#include <algorithm>
#include <unistd.h>

using namespace std;

namespace SDMS {
namespace Core {

TaskMgr *TaskMgr::global_task_mgr;
std::mutex TaskMgr::singleton_instance_mutex;

void TaskMgr::initialize(LogContext log_context) {
  m_log_context = log_context;

  TaskWorker *worker;

  ++m_thread_count;
  m_maint_thread = new thread(&TaskMgr::maintenanceThread, this, m_log_context,
                              m_thread_count);

  unique_lock<mutex> lock(m_worker_mutex);

  /*
     OpenSSL currently is thread-NOT-safe by default. In order to make it
     thread-safe the caller has to provide various callbacks for locking, atomic
     integer addition, and thread ID determination (this last has reasonable
     defaults). This makes it difficult to use OpenSSL from multiple distinct
     objects in one multi-threaded process: one of them had better provide these
     callbacks, but only one of them should.

     Currently the only moderately safe way for libraries using OpenSSL to
     handle thread safety is to do the following as early as possible, possible
     in .init or DllMain:

     Check if the locking callback has been set, then set it if not;
     CRYPTO_w_lock(CRYPTO_LOCK_DYNLOCK), set the remaining callbacks (threadid,
     dynlock, and add_lock) if not already set, then
     CRYPTO_w_unlock(CRYPTO_LOCK_DYNLOCK);

     In the future we hope that OpenSSL will self-initialize thread-safely to
     use native threading where available.
     */
  /*
     CRYPTO_w_lock(CRYPTO_LOCK_DYNLOCK);

     CRYPTO_w_unlock(CRYPTO_LOCK_DYNLOCK);
     */

  DL_DEBUG(m_log_context, "TaskMgr creating "
                              << m_config.num_task_worker_threads
                              << " task worker threads.");

  for (uint32_t i = 0; i < m_config.num_task_worker_threads; i++) {
    worker = new TaskWorker(*this, i, m_log_context);
    if (i) {
      m_workers.back()->m_next = worker;
    }

    m_workers.push_back(worker);
  }

  m_worker_next = m_workers.front();

  lock.unlock();

  // Load ready & running tasks and schedule workers
  // TODO This will break if there are too many tasks - must implement a paging
  // system to load chunks of tasks.
  std::cout << "Task manager initialize creating db, cred dir is: " << m_config.cred_dir << std::endl;
  DatabaseAPI db(m_config.db_url, m_config.db_user, m_config.db_pass, m_config.cred_dir);
  libjson::Value tasks;
  db.taskLoadReady(tasks, m_log_context);
  newTasks(tasks, m_log_context);
}

TaskMgr::TaskMgr(LogContext log_context)
    : m_config(Config::getInstance()), m_worker_next(0), m_maint_thread(0) {
  initialize(log_context);
}

TaskMgr::TaskMgr()
    : m_config(Config::getInstance()), m_worker_next(0), m_maint_thread(0) {
  LogContext log_context;
  initialize(log_context);
}

TaskMgr::~TaskMgr() {}

TaskMgr &TaskMgr::getInstance() {
  if (global_task_mgr == nullptr) {
    EXCEPT(1, "Something is really wrong, the getInstance() should only be "
              "called after the getInstance(log_context, thread_id) command "
              "has been called");
  }

  return *global_task_mgr;
}

TaskMgr &TaskMgr::getInstance(LogContext log_context, int thread_id) {
  if (global_task_mgr == nullptr) {
    std::lock_guard<std::mutex> lock(singleton_instance_mutex);
    if (global_task_mgr == nullptr) {
      log_context.thread_name += "-TaskMgr";
      log_context.thread_id = thread_id;
      global_task_mgr = new TaskMgr(log_context);
    }
  }

  return *global_task_mgr;
}
/**
 * @brief Task background maintenance thread
 *
 * This thread is responsible for rescheduling failed tasks (due to transient
 * errors) and for periodically purging old tasks records from the database.
 */
void TaskMgr::maintenanceThread(LogContext log_context, int thread_id) {
  log_context.thread_name += "-maintenaceThread";
  log_context.thread_id = thread_id;
  duration_t purge_per = chrono::seconds(m_config.task_purge_period);
  timepoint_t now = chrono::system_clock::now();
  timepoint_t purge_next = now + purge_per;
  timepoint_t timeout;
  multimap<timepoint_t, std::unique_ptr<Task>>::iterator t;
  unique_lock<mutex> sched_lock(m_worker_mutex, defer_lock);
  unique_lock<mutex> maint_lock(m_maint_mutex);

  purgeTaskHistory(log_context);

  while (1) {
    // Default timeout is time until next purge
    timeout = purge_next;
    DL_INFO(log_context,
            "MAINT: Next purge: " << chrono::duration_cast<chrono::seconds>(
                                         purge_next.time_since_epoch())
                                         .count());
    DL_INFO(log_context,
            "MAINT: tasks in retry queue: " << m_tasks_retry.size());

    // Adjust timeout if a task retry should happen sooner
    t = m_tasks_retry.begin();
    if (t != m_tasks_retry.end()) {
      DL_INFO(log_context,
              "MAINT: Check next task retry: " << t->second->task_id);
      if (t->first < purge_next) {
        timeout = t->first;
        DL_INFO(log_context, "MAINT: timeout based on next retry: "
                                 << chrono::duration_cast<chrono::seconds>(
                                        t->first.time_since_epoch())
                                        .count());
      }
    }

    DL_INFO(log_context,
            "MAINT: timeout: " << chrono::duration_cast<chrono::seconds>(
                                      timeout.time_since_epoch())
                                      .count());

    // TODO - WHY are we using a mutex here that is used nowhere else? Is this
    // left over from previous design where worker threads needed be to
    // excluded? ANALYZE AND FIX

    if (timeout > now) {
      DL_INFO(log_context, "MAINT: timeout > now then wait_until ");
      m_maint_cvar.wait_until(maint_lock, timeout);
    }

    maint_lock.unlock();

    now = chrono::system_clock::now();

    if (now >= purge_next) {
      DL_INFO(log_context, "MAINT: purgeTaskHistory ");
      purgeTaskHistory(log_context);

      now = chrono::system_clock::now();
      purge_next = now + purge_per;
    }

    maint_lock.lock();
    sched_lock.lock();

    // Reschedule tasks for retry
    DL_INFO(log_context,
            "MAINT: tasks in retry queue: " << m_tasks_retry.size());

    // worker = m_worker_next;

    for (t = m_tasks_retry.begin(); t != m_tasks_retry.end();) {
      if (t->first <= now) {
        DL_INFO(log_context,
                "MAINT: rescheduling failed task " << t->second->task_id);

        retryTaskAndScheduleWorker(std::move(t->second), log_context);
        t = m_tasks_retry.erase(t);
      } else
        break;
    }

    sched_lock.unlock();

    now = chrono::system_clock::now();
  }
}

void TaskMgr::purgeTaskHistory(LogContext log_context) const {
  try {
    std::cout << "Task manager purgeTaskHistory creating db, cred dir is: " << m_config.cred_dir << std::endl;
    DatabaseAPI db(m_config.db_url, m_config.db_user, m_config.db_pass, m_config.cred_dir);

    db.taskPurge(m_config.task_purge_age, log_context);
  } catch (TraceException &e) {
    DL_ERROR(log_context, "TaskMgr: purging failed - " << e.toString());
  } catch (...) {
    DL_ERROR(log_context, "TaskMgr: purging failed - unknown exception.");
  }
}

/**
 * @brief Public method to add a new task to the "ready" queue
 * @param a_task_id - Task ID for NEW or READY task
 *
 * Adds task to ready queue and schedules a worker if available. Called by
 * ClientWorkers or other external entities.
 *
 * NOTE: Takes ownership of JSON value leaving a NULL value in place.
 */
void TaskMgr::newTask(const std::string &a_task_id, LogContext log_context) {
  DL_DEBUG(log_context, "TaskMgr scheduling 1 new task");

  // TODO BREAKS FAIR SCHEDULING - under heavy loading, this method will allow
  // new tasks to take priority over older tasks that may not be loaded. When
  // off-loading is added, need to check here for overflow and only schedule if
  // system is below capacity.
  lock_guard<mutex> lock(m_worker_mutex);

  addNewTaskAndScheduleWorker(a_task_id, log_context);
}

/**
 * @brief Internal method to add one or more new tasks
 *
 * @param a_tasks JSON array of task IDs for NEW and READY tasks
 *
 * Adds task(s) to ready queue and schedules workers if available. Called by
 * TaskWorkers after finalizing a task returns new and/or unblocked tasks.
 */
void TaskMgr::newTasks(const libjson::Value &a_tasks, LogContext log_context) {
  try {
    const libjson::Value::Array &arr = a_tasks.asArray();
    libjson::Value::ArrayConstIter t = arr.begin();

    DL_DEBUG(log_context,
             "TaskMgr scheduling " << arr.size() << " new task(s)");

    lock_guard<mutex> lock(m_worker_mutex);

    for (; t != arr.end(); t++) {
      addNewTaskAndScheduleWorker(t->asString(), log_context);
    }
  } catch (...) {
    DL_ERROR(log_context,
             "TaskMgr::newTasks - Bad task JSON returned from DB.");
  }
}

/**
 * @brief Private method to add task and schedule
 *
 * @param a_task - JSON task descriptor
 *
 * NOTE: must be called with m_worker_mutex held by caller
 */
void TaskMgr::addNewTaskAndScheduleWorker(const std::string &a_task_id,
                                          LogContext log_context) {
  // TODO Add logic to limit max number of ready tasks in memory

  DL_DEBUG(log_context, "Adding task " << a_task_id);
  m_tasks_ready.push_back(std::make_unique<Task>(a_task_id));

  if (m_worker_next) {
    DL_DEBUG(log_context, "Waking task worker " << m_worker_next->id());
    m_worker_next->m_run = true;
    m_worker_next->m_cvar.notify_one();
    m_worker_next = m_worker_next->m_next ? m_worker_next->m_next : 0;
  }
}

void TaskMgr::retryTaskAndScheduleWorker(std::unique_ptr<Task> a_task,
                                         LogContext log_context) {
  DL_DEBUG(log_context, "Retrying task " << a_task->task_id);
  m_tasks_ready.push_back(std::move(a_task));

  if (m_worker_next) {
    DL_DEBUG(log_context, "Waking task worker " << m_worker_next->id());
    m_worker_next->m_run = true;
    m_worker_next->m_cvar.notify_one();
    m_worker_next = m_worker_next->m_next ? m_worker_next->m_next : 0;
  }
}

void TaskMgr::cancelTask(const std::string &a_task_id, LogContext log_context) {
  DL_WARNING(log_context,
             "TaskMgr cancel task (NOT IMPLEMENTED) " << a_task_id);

  // TODO Implement task cancel
  // The old implementation below was insufficient to cancel running tasks

  /*
      unique_lock<mutex> lock( m_worker_mutex );

      map<string,Task*>::iterator t = m_tasks_running.find( a_task_id );

      if ( t != m_tasks_running.end() )
      {
          t->second->cancel = true;
      }
      else
      {
          for ( deque<Task*>::iterator t = m_tasks_ready.begin(); t !=
     m_tasks_ready.end(); t++ )
          {
              if ( (*t)->task_id == a_task_id )
              {
                  Task * task = *t;
                  m_tasks_ready.erase( t );

                  lock.unlock();

                  DatabaseClient  db( m_config.db_url , m_config.db_user,
     m_config.db_pass );

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
std::unique_ptr<TaskMgr::Task> TaskMgr::getNextTask(ITaskWorker *a_worker) {

  unique_lock<mutex> lock(m_worker_mutex);
  LogContext log_context;

  if (m_tasks_ready.empty()) {
    // No work right now, put worker at front of ready worker queue
    a_worker->m_run = false;
    a_worker->m_next = m_worker_next;
    m_worker_next = a_worker;

    // Sleep until work available, run flag suppresses spurious wakes
    while (m_tasks_ready.empty() || !a_worker->m_run)
      a_worker->m_cvar.wait(lock);
  }

  // Pop next task from ready queue and place in running map
  DL_DEBUG(log_context,
           "There are " << m_tasks_ready.size() << " grabbing one.");
  auto task = std::move(m_tasks_ready.front());
  m_tasks_ready.pop_front();
  DL_DEBUG(log_context, "Now there are " << m_tasks_ready.size() << " left.");

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
bool TaskMgr::retryTask(std::unique_ptr<Task> a_task, LogContext log_context) {
  DL_DEBUG(log_context, "Retry task " << a_task->task_id);

  timepoint_t now = chrono::system_clock::now();

  if (a_task->retry_count == 0) {
    DL_DEBUG(log_context, "Retry first time");

    a_task->retry_count++;
    a_task->retry_time = now + chrono::seconds(m_config.task_retry_time_init);
    a_task->retry_fail_time =
        now + chrono::seconds(m_config.task_retry_time_fail);

    DL_DEBUG(log_context,
             "Retry time " << chrono::duration_cast<chrono::seconds>(
                                  a_task->retry_time.time_since_epoch())
                                  .count());
    DL_DEBUG(log_context,
             "Fail time " << chrono::duration_cast<chrono::seconds>(
                                 a_task->retry_fail_time.time_since_epoch())
                                 .count());

    lock_guard<mutex> lock(m_maint_mutex);

    m_tasks_retry.insert(make_pair(a_task->retry_time, std::move(a_task)));
    m_maint_cvar.notify_one();
  } else if (now < a_task->retry_fail_time) {
    DL_DEBUG(log_context, "Retry num " << a_task->retry_count);

    a_task->retry_count++;

    a_task->retry_time =
        now +
        chrono::seconds((uint32_t)(
            m_config.task_retry_time_init *
            exp2(min(m_config.task_retry_backoff_max, a_task->retry_count))));

    DL_DEBUG(log_context,
             "Next retry time " << chrono::duration_cast<chrono::seconds>(
                                       a_task->retry_time.time_since_epoch())
                                       .count());

    lock_guard<mutex> lock(m_maint_mutex);

    m_tasks_retry.insert(make_pair(a_task->retry_time, std::move(a_task)));
    m_maint_cvar.notify_one();
  } else {
    DL_DEBUG(log_context, "Max retries");
    return true;
  }

  return false;
}

} // namespace Core
} // namespace SDMS
