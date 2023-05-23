#ifndef TASKMGR_HPP
#define TASKMGR_HPP
#pragma once

// Local private includes
#include "ITaskMgr.hpp"
#include "ITaskWorker.hpp"
#include "Config.hpp"

// Local public includes
#include "common/libjson.hpp"
#include "common/SDMS_Auth.pb.h"
#include "common/SDMS.pb.h"

// Standard includes
#include <chrono>
#include <condition_variable>
#include <deque>
#include <list>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace SDMS {
namespace Core {

class TaskMgr : public ITaskMgr
{
public:
    static TaskMgr & getInstance();
    static TaskMgr & getInstance(LogContext log_context, int thread_id);

    // Public interface used by CoreWorkers
    void    newTask( const std::string & a_task_id, LogContext log_context );
    void    cancelTask( const std::string & a_task_id, LogContext log_context );
private:
    TaskMgr();
    TaskMgr(LogContext log_context);
    ~TaskMgr();

    void    initialize(LogContext log_context);
    // ITaskMgr methods used by TaskWorkers
    std::unique_ptr<Task>      getNextTask( ITaskWorker * a_worker );
    bool        retryTask( std::unique_ptr<Task> a_task, LogContext log_context );
    void        newTasks( const libjson::Value & a_tasks, LogContext log_context );

    // Private methods
    void        maintenanceThread(LogContext, int);
    void        addNewTaskAndScheduleWorker( const std::string & a_task_id, LogContext log_context );
    void        retryTaskAndScheduleWorker( std::unique_ptr<Task> a_task, LogContext log_context );
    void        wakeNextWorker();
    void        purgeTaskHistory(LogContext log_context) const;

    Config &                            m_config;
    std::deque<std::unique_ptr<Task>>                   m_tasks_ready;
    std::multimap<timepoint_t,std::unique_ptr<Task>>    m_tasks_retry;
    std::mutex                          m_worker_mutex;
    std::vector<ITaskWorker*>           m_workers;
    ITaskWorker *                       m_worker_next;
    std::thread *                       m_maint_thread;
    std::mutex                          m_maint_mutex;
    std::condition_variable             m_maint_cvar;
    LogContext                          m_log_context;
    int m_thread_count =0;
};

}}

#endif
