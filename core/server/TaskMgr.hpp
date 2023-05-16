#ifndef TASKMGR_HPP
#define TASKMGR_HPP
#pragma once

// Local private includes
#include "Config.hpp"
#include "ITaskMgr.hpp"
#include "ITaskWorker.hpp"

// Local public includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/libjson.hpp"

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

class TaskMgr : public ITaskMgr {
 public:
  static TaskMgr& getInstance();

  // Public interface used by CoreWorkers
  void newTask(const std::string& a_task_id);
  void cancelTask(const std::string& a_task_id);

 private:
  TaskMgr();
  ~TaskMgr();

  // ITaskMgr methods used by TaskWorkers
  Task* getNextTask(ITaskWorker* a_worker);
  bool retryTask(Task* a_task);
  void newTasks(const libjson::Value& a_tasks);

  // Private methods
  void maintenanceThread();
  void addNewTaskAndScheduleWorker(const std::string& a_task_id);
  void retryTaskAndScheduleWorker(Task* a_task);
  void wakeNextWorker();
  void purgeTaskHistory() const;

  Config& m_config;
  std::deque<Task*> m_tasks_ready;
  std::multimap<timepoint_t, Task*> m_tasks_retry;
  std::mutex m_worker_mutex;
  std::vector<ITaskWorker*> m_workers;
  ITaskWorker* m_worker_next;
  std::thread* m_maint_thread;
  std::mutex m_maint_mutex;
  std::condition_variable m_maint_cvar;
};

}  // namespace Core
}  // namespace SDMS

#endif
