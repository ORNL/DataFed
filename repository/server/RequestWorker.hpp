#ifndef REQUESTWORKER_HPP
#define REQUESTWORKER_HPP
#pragma once

// Local public includes
#include "Config.hpp"

// Common public includes
#include "common/DynaLog.hpp"
#include "common/IMessage.hpp"
#include "common/IMessageMapper.hpp"
#include "common/MessageFactory.hpp"

// Standard includes
#include <algorithm>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace SDMS {
namespace Repo {

class RequestWorker {
public:
  RequestWorker(size_t a_tid, LogContext log_context);
  ~RequestWorker();

  void stop();
  void wait();

private:
  void setupMsgHandlers();
  void workerThread(LogContext log_context);

  std::unique_ptr<IMessage> procVersionRequest(std::unique_ptr<IMessage> &&);
  std::unique_ptr<IMessage> procDataDeleteRequest(std::unique_ptr<IMessage> &&);
  std::unique_ptr<IMessage>
  procDataGetSizeRequest(std::unique_ptr<IMessage> &&);
  std::unique_ptr<IMessage> procPathCreateRequest(std::unique_ptr<IMessage> &&);
  std::unique_ptr<IMessage> procPathDeleteRequest(std::unique_ptr<IMessage> &&);

  Config &m_config;
  size_t m_tid;
  std::thread *m_worker_thread;
  bool m_run;

  typedef std::unique_ptr<IMessage> (RequestWorker::*msg_fun_t)(
      std::unique_ptr<IMessage> &&request);
  static std::map<uint16_t, msg_fun_t> m_msg_handlers;

  std::unique_ptr<IMessageMapper> m_msg_mapper;
  MessageFactory m_msg_factory;
  LogContext m_log_context;
};

} // namespace Repo
} // namespace SDMS

#endif
