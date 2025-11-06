#ifndef COREWORKER_HPP
#define COREWORKER_HPP
#pragma once

// Local private includes
#include "Config.hpp"
#include "IMockCoreServer.hpp"

// DataFed Common public includes
#include "common/DynaLog.hpp"
#include "common/IMessage.hpp"
#include "common/IMessageMapper.hpp"
#include "common/MessageFactory.hpp"
#include "common/Util.hpp"

// Third party includes
#include <zmq.h>

// Standard includes
#include <algorithm>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace SDMS {
namespace MockCore {

/**
 * The ClientWorker class provides client message processing on a dedicated
 * thread.
 *
 * The ClientWorker class handles client-originating messages and either
 * processes requests directly or passes them on to the DB. Most requests can be
 * handled by the database alone, but requests that require orchestration with
 * other parts of the system are handled by the ClientWorker.
 */
class ClientWorker {
public:
  /// ClientWorker constructor
  ClientWorker(IMockCoreServer &a_core, size_t a_tid, LogContext log_context);

  /// ClientWorker destructor
  ~ClientWorker();

  /// Request ClientWorker to stop processing requests
  void stop();

  /// Wait for ClientWorker thread to exit after stop()
  void wait();

private:
  void setupMsgHandlers();
  void workerThread(LogContext log_context);

  // Routing functions
  std::unique_ptr<IMessage>
  procVersionRequest(const std::string &a_uid,
                     std::unique_ptr<IMessage> &&msg_request,
                     LogContext log_context);

  std::unique_ptr<IMessage>
  procRepoAuthzRequest(const std::string &a_uid,
                       std::unique_ptr<IMessage> &&msg_request,
                       LogContext log_context);

  typedef std::unique_ptr<IMessage> (ClientWorker::*msg_fun_t)(
      const std::string &a_uid, std::unique_ptr<IMessage> &&request,
      LogContext log_context);

  bool isRunning() const;

  Config &m_config; ///< Ref to configuration singleton
  size_t m_tid;     ///< Thread ID
  std::unique_ptr<std::thread> m_worker_thread; ///< Local thread handle
  mutable std::mutex m_run_mutex;
  bool m_run; ///< Thread run flag
  LogContext m_log_context;
  MessageFactory m_msg_factory;
  std::unique_ptr<IMessageMapper> m_msg_mapper;
  /// Map of message type to message handler functions
  static std::map<uint16_t, msg_fun_t> m_msg_handlers;
};

} // namespace MockCore
} // namespace SDMS

#endif
