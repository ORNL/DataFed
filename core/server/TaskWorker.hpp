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
#include <atomic>
#include <memory>
#include <string>
#include <thread>
#include <map>
#include <unordered_map>

namespace SDMS {
namespace Core {

class TaskWorker : public ITaskWorker {

public:
  TaskWorker(ITaskMgr &a_mgr, uint32_t a_id, LogContext log_context);
  ~TaskWorker();

  enum class Token_Name
  {
    ACCESS,
    REFRESH
  };

  static std::map<Token_Name, std::string> tokenNameToString;
  static std::string enumToString(Token_Name token_name);
protected:
  static bool tokenNeedsUpdate(const libjson::Value::Object &obj);
  static std::string prepToken(const libjson::Value::Object &obj, std::string token, const std::string& cipher_key_path, bool needs_update, LogContext log_context);
private:
  typedef ICommunicator::Response (*task_function_t)(
      TaskWorker &me, const libjson::Value &a_task_params,
      LogContext log_context);

  // uint32_t - TaskCommand enum
  std::unordered_map<uint32_t, task_function_t> m_execute;

  void workerThread(LogContext log_context);

  // Must be static to store function pointers in a map
  static ICommunicator::Response
  cmdRawDataTransfer(TaskWorker &me, const libjson::Value &a_task_params,
                     LogContext log_context);
  static ICommunicator::Response
  cmdRawDataDelete(TaskWorker &me, const libjson::Value &a_task_params,
                   LogContext log_context);
  static ICommunicator::Response
  cmdRawDataUpdateSize(TaskWorker &me, const libjson::Value &a_task_params,
                       LogContext log_context);
  static ICommunicator::Response
  cmdAllocCreate(TaskWorker &me, const libjson::Value &a_task_params,
                 LogContext log_context);
  static ICommunicator::Response
  cmdAllocDelete(TaskWorker &me, const libjson::Value &a_task_params,
                 LogContext log_context);

  bool checkEncryption(const GlobusAPI::EndpointInfo &a_ep_info,
                       Encryption a_encrypt);
  bool checkEncryption(const GlobusAPI::EndpointInfo &a_ep_info1,
                       const GlobusAPI::EndpointInfo &a_ep_info2,
                       Encryption a_encrypt);
  ICommunicator::Response repoSendRecv(const std::string &a_repo_id,
                                       std::unique_ptr<IMessage> &&a_msg,
                                       LogContext log_context);

  ITaskMgr &m_mgr;
  std::unique_ptr<std::thread> m_thread;
  ITaskMgr::Task *m_task;
  DatabaseAPI m_db;
  GlobusAPI m_glob;
  std::atomic<bool> m_running = true;
};

} // namespace Core
} // namespace SDMS

#endif
