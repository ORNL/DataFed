#ifndef ITASKMGR_HPP
#define ITASKMGR_HPP
#pragma once

// Local private includes
#include "ITaskWorker.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/libjson.hpp"

// Standard includes
#include <memory>
#include <string>

namespace SDMS {
namespace Core {

/**
 * @brief Interface use by TaskWorkers to interact with TaskMgr
 * 
 * This interface is "private" for TaskWorkers only, not for external clients
 * of the TaskMgr (i.e. ClientWorkers). Provides worker scheduling and work
 * work assignment methods. Also defines a task control structure for ready
 * and running tasks.
 */
class ITaskMgr
{
public:
    typedef std::chrono::system_clock::time_point   timepoint_t;
    typedef std::chrono::system_clock::duration     duration_t;

    struct Task
    {
        Task( const std::string & a_id ) :
            task_id( a_id ), cancel(false), retry_count(0)
        {}

        ~Task()
        {}

        std::string         task_id;
        bool                cancel;
        uint32_t            retry_count;
        timepoint_t         retry_time;
        timepoint_t         retry_fail_time;
    };

    virtual std::unique_ptr<Task>      getNextTask( ITaskWorker * a_worker ) = 0;
    virtual bool        retryTask( std::unique_ptr<Task> a_task, LogContext log_context ) = 0;
    virtual void        newTasks( const libjson::Value & a_tasks, LogContext log_context ) = 0;
};

}}

#endif
