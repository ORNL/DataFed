#ifndef TASKMGR_HPP
#define TASKMGR_HPP

#include <chrono>
#include <string>
#include <vector>
#include <list>
#include <deque>
#include <map>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <libjson.hpp>
#include "ITaskMgr.hpp"
#include "ITaskWorker.hpp"
#include "Config.hpp"
#include "SDMS_Auth.pb.h"
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class TaskMgr : public ITaskMgr
{
public:
    static TaskMgr & getInstance();

    // Public interface used by CoreWorkers
    void    newTask( const std::string & a_task_id );
    void    cancelTask( const std::string & a_task_id );

private:
    TaskMgr();
    ~TaskMgr();

    // ITaskMgr methods used by TaskWorkers
    Task *      getNextTask( ITaskWorker * a_worker );
    bool        retryTask( Task * a_task );
    void        newTasks( const libjson::Value & a_tasks );

    // Private methods
    void        maintenanceThread();
    void        addNewTaskAndScheduleWorker( const std::string & a_task_id );
    void        retryTaskAndScheduleWorker( Task * a_task );
    void        wakeNextWorker();
    void        purgeTaskHistory() const;

    Config &                            m_config;
    std::deque<Task*>                   m_tasks_ready;
    std::multimap<timepoint_t,Task*>    m_tasks_retry;
    std::mutex                          m_worker_mutex;
    std::vector<ITaskWorker*>           m_workers;
    ITaskWorker *                       m_worker_next;
    std::thread *                       m_maint_thread;
    std::mutex                          m_maint_mutex;
    std::condition_variable             m_maint_cvar;
};

}}

#endif
