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
#include <nlohmann/json-schema.hpp>
#include <nlohmann/json.hpp>
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
class ClientWorker : public nlohmann::json_schema::basic_error_handler {
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

  void error(const nlohmann::json_pointer<nlohmann::basic_json<>> &a_ptr,
             const nlohmann::json &a_inst,
             const std::string &a_err_msg) override {
    (void)a_ptr;
    (void)a_inst;
    const std::string &path = a_ptr.to_string();

    if (m_validator_err.size() == 0)
      m_validator_err = "Schema Validation Error(s):\n";

    m_validator_err +=
        "At " + (path.size() ? path : "top-level") + ": " + a_err_msg + "\n";
  }

  bool isRunning() const;

  Config &m_config;    ///< Ref to configuration singleton
  IMockCoreServer &m_core; ///< Ref to parent MockCoreServer interface
  size_t m_tid;        ///< Thread ID
  std::unique_ptr<std::thread> m_worker_thread; ///< Local thread handle
  mutable std::mutex m_run_mutex;
  bool m_run;                  ///< Thread run flag
  std::string m_validator_err; ///< String buffer for metadata validation errors
  LogContext m_log_context;
  MessageFactory m_msg_factory;
  std::unique_ptr<IMessageMapper> m_msg_mapper;
  /// Map of message type to message handler functions
  static std::map<uint16_t, msg_fun_t> m_msg_handlers;
};

} // namespace MockCore
} // namespace SDMS

#endif
