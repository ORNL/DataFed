#ifndef TASKWORKER_HPP
#define TASKWORKER_HPP
#pragma once

// Local private includes
#include "DatabaseAPI.hpp"
#include "GlobusAPI.hpp"
#include "ITaskMgr.hpp"
#include "ITaskWorker.hpp"

// Common public includes
#include "common/ICommunicator.hpp"
#include "common/IMessage.hpp"

// Standard includes
#include <memory>
#include <string>
#include <thread>
#include <unordered_map>

namespace SDMS {
namespace Core {

class TaskWorker : public ITaskWorker {
 public:
  TaskWorker(ITaskMgr& a_mgr, uint32_t a_id);
  ~TaskWorker();

 private:
  typedef ICommunicator::Response (*task_function_t)(
      TaskWorker& me, const libjson::Value& a_task_params);

  // uint32_t - TaskCommand enum
  std::unordered_map<uint32_t, task_function_t> m_execute;

  void workerThread();

  // Must be static to store function pointers in a map
  static ICommunicator::Response cmdRawDataTransfer(
      TaskWorker& me, const libjson::Value& a_task_params);
  static ICommunicator::Response cmdRawDataDelete(
      TaskWorker& me, const libjson::Value& a_task_params);
  static ICommunicator::Response cmdRawDataUpdateSize(
      TaskWorker& me, const libjson::Value& a_task_params);
  static ICommunicator::Response cmdAllocCreate(
      TaskWorker& me, const libjson::Value& a_task_params);
  static ICommunicator::Response cmdAllocDelete(
      TaskWorker& me, const libjson::Value& a_task_params);

  bool checkEncryption(const GlobusAPI::EndpointInfo& a_ep_info,
                       Encryption a_encrypt);
  bool checkEncryption(const GlobusAPI::EndpointInfo& a_ep_info1,
                       const GlobusAPI::EndpointInfo& a_ep_info2,
                       Encryption a_encrypt);
  ICommunicator::Response repoSendRecv(const std::string& a_repo_id,
                                       std::unique_ptr<IMessage>&& a_msg);

  ITaskMgr& m_mgr;
  std::thread* m_thread;
  ITaskMgr::Task* m_task;
  DatabaseAPI m_db;
  GlobusAPI m_glob;
};

}  // namespace Core
}  // namespace SDMS

#endif
