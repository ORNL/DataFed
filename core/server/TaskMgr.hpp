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
#include "TaskWorker.hpp"
#include "Config.hpp"
#include "SDMS_Auth.pb.h"
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

//class TaskWorker;

class TaskMgr : public ITaskMgr
{
public:
    static TaskMgr & getInstance();

    void    newTask( libjson::Value & a_task );
    void    cancelTask( const std::string & a_task_id );

private:
    //typedef std::vector<std::pair<std::string,std::string>> url_params_t;

    TaskMgr();
    ~TaskMgr();

    void        maintenanceThread();
    void        wakeNextWorker();
    void        loadReadyTasks();
    Task *      getNextTask();
    bool        retryTask();


    Config &                            m_config;
    std::deque<Task*>                   m_tasks_ready;
    std::multimap<timepoint_t,Task*>    m_tasks_retry;
    //std::map<std::string,Task*>         m_tasks_running;
    std::mutex                          m_worker_mutex;
    std::vector<TaskWorker*>            m_workers;
    //std::list<TaskWorker*>              m_ready_workers;
    TaskWorker *                        m_worker_next;
    std::thread *                       m_maint_thread;
    std::mutex                          m_maint_mutex;
    std::condition_variable             m_maint_cvar;
};

}}

#endif
