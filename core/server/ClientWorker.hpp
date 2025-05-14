#ifndef COREWORKER_HPP
#define COREWORKER_HPP
#pragma once

// Local private includes
#include "DatabaseAPI.hpp"
#include "GlobusAPI.hpp"
#include "ICoreServer.hpp"

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
namespace Core {

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
  ClientWorker(ICoreServer &a_core, size_t a_tid, LogContext log_context);

  /// ClientWorker destructor
  ~ClientWorker();

  /// Request ClientWorker to stop processing requests
  void stop();

  /// Wait for ClientWorker thread to exit after stop()
  void wait();

private:
  void setupMsgHandlers();
  void workerThread(LogContext log_context);
  template <typename RQ, typename RP,
            void (DatabaseAPI::*func)(const RQ &, RP &, LogContext log_context)>
  std::unique_ptr<IMessage>
  dbPassThrough(const std::string &a_uid,
                std::unique_ptr<IMessage> &&msg_request,
                LogContext log_context);

  std::unique_ptr<IMessage>
  procRepoCreate(const std::string &a_uid,
                 std::unique_ptr<IMessage> &&msg_request,
                 LogContext log_context);
  std::unique_ptr<IMessage>
  procRepoUpdate(const std::string &a_uid,
                 std::unique_ptr<IMessage> &&msg_request,
                 LogContext log_context);
  std::unique_ptr<IMessage>
  procRepoDelete(const std::string &a_uid,
                 std::unique_ptr<IMessage> &&msg_request,
                 LogContext log_context);
  std::unique_ptr<IMessage>
  procGetAuthStatusRequest(const std::string &a_uid,
                           std::unique_ptr<IMessage> &&msg_request,
                           LogContext log_context);
  std::unique_ptr<IMessage>
  procVersionRequest(const std::string &a_uid,
                     std::unique_ptr<IMessage> &&msg_request,
                     LogContext log_context);
  std::unique_ptr<IMessage>
  procAuthenticateByPasswordRequest(const std::string &a_uid,
                                    std::unique_ptr<IMessage> &&msg_request,
                                    LogContext log_context);
  std::unique_ptr<IMessage>
  procAuthenticateByTokenRequest(const std::string &a_uid,
                                 std::unique_ptr<IMessage> &&msg_request,
                                 LogContext log_context);
  std::unique_ptr<IMessage>
  procGenerateCredentialsRequest(const std::string &a_uid,
                                 std::unique_ptr<IMessage> &&msg_request,
                                 LogContext log_context);
  std::unique_ptr<IMessage>
  procRevokeCredentialsRequest(const std::string &a_uid,
                               std::unique_ptr<IMessage> &&msg_request,
                               LogContext log_context);
  std::unique_ptr<IMessage>
  procDataGetRequest(const std::string &a_uid,
                     std::unique_ptr<IMessage> &&msg_request,
                     LogContext log_context);
  std::unique_ptr<IMessage>
  procDataPutRequest(const std::string &a_uid,
                     std::unique_ptr<IMessage> &&msg_request,
                     LogContext log_context);
  std::unique_ptr<IMessage>
  procDataCopyRequest(const std::string &a_uid,
                      std::unique_ptr<IMessage> &&msg_request,
                      LogContext log_context);
  std::unique_ptr<IMessage>
  procRecordCreateRequest(const std::string &a_uid,
                          std::unique_ptr<IMessage> &&msg_request,
                          LogContext log_context);
  std::unique_ptr<IMessage>
  procRecordUpdateRequest(const std::string &a_uid,
                          std::unique_ptr<IMessage> &&msg_request,
                          LogContext log_context);
  std::unique_ptr<IMessage>
  procRecordUpdateBatchRequest(const std::string &a_uid,
                               std::unique_ptr<IMessage> &&msg_request,
                               LogContext log_context);
  std::unique_ptr<IMessage>
  procRecordDeleteRequest(const std::string &a_uid,
                          std::unique_ptr<IMessage> &&msg_request,
                          LogContext log_context);
  std::unique_ptr<IMessage>
  procRecordAllocChangeRequest(const std::string &a_uid,
                               std::unique_ptr<IMessage> &&msg_request,
                               LogContext log_context);
  std::unique_ptr<IMessage>
  procRecordOwnerChangeRequest(const std::string &a_uid,
                               std::unique_ptr<IMessage> &&msg_request,
                               LogContext log_context);
  std::unique_ptr<IMessage>
  procCollectionDeleteRequest(const std::string &a_uid,
                              std::unique_ptr<IMessage> &&msg_request,
                              LogContext log_context);
  std::unique_ptr<IMessage>
  procProjectDeleteRequest(const std::string &a_uid,
                           std::unique_ptr<IMessage> &&msg_request,
                           LogContext log_context);
  std::unique_ptr<IMessage>
  procProjectSearchRequest(const std::string &a_uid,
                           std::unique_ptr<IMessage> &&msg_request,
                           LogContext log_context);
  std::unique_ptr<IMessage>
  procRepoAllocationCreateRequest(const std::string &a_uid,
                                  std::unique_ptr<IMessage> &&msg_request,
                                  LogContext log_context);
  std::unique_ptr<IMessage>
  procRepoAllocationDeleteRequest(const std::string &a_uid,
                                  std::unique_ptr<IMessage> &&msg_request,
                                  LogContext log_context);
  std::unique_ptr<IMessage>
  procRepoAuthzRequest(const std::string &a_uid,
                       std::unique_ptr<IMessage> &&msg_request,
                       LogContext log_context);
  std::unique_ptr<IMessage>
  procUserGetAccessTokenRequest(const std::string &a_uid,
                                std::unique_ptr<IMessage> &&msg_request,
                                LogContext log_context);
  std::unique_ptr<IMessage>
  procMetadataValidateRequest(const std::string &a_uid,
                              std::unique_ptr<IMessage> &&msg_request,
                              LogContext log_context);
  std::unique_ptr<IMessage>
  procSchemaCreateRequest(const std::string &a_uid,
                          std::unique_ptr<IMessage> &&msg_request,
                          LogContext log_context);
  std::unique_ptr<IMessage>
  procSchemaReviseRequest(const std::string &a_uid,
                          std::unique_ptr<IMessage> &&msg_request,
                          LogContext log_context);
  std::unique_ptr<IMessage>
  procSchemaUpdateRequest(const std::string &a_uid,
                          std::unique_ptr<IMessage> &&msg_request,
                          LogContext log_context);

  void schemaEnforceRequiredProperties(const nlohmann::json &a_schema);
  void recordCollectionDelete(const std::vector<std::string> &a_ids,
                              Auth::TaskDataReply &a_reply,
                              LogContext log_context);
  void handleTaskResponse(libjson::Value &a_result, LogContext log_context);

  inline bool isPhrase(const std::string &str) {
    return find_if(str.begin(), str.end(),
                   [](char c) { return !isalnum(c); }) != str.end();
  }

  typedef std::unique_ptr<IMessage> (ClientWorker::*msg_fun_t)(
      const std::string &a_uid, std::unique_ptr<IMessage> &&request,
      LogContext log_context);

  void schemaLoader(const nlohmann::json_uri &a_uri, nlohmann::json &a_value,
                    LogContext log_context);

  void error(const nlohmann::json::json_pointer &a_ptr,
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
  ICoreServer &m_core; ///< Ref to parent CoreServer interface
  size_t m_tid;        ///< Thread ID
  std::unique_ptr<std::thread> m_worker_thread; ///< Local thread handle
  mutable std::mutex m_run_mutex;
  bool m_run;                  ///< Thread run flag
  DatabaseAPI m_db_client;     ///< Local DB client instance
  GlobusAPI m_globus_api;      ///< Local GlobusAPI instance
  std::string m_validator_err; ///< String buffer for metadata validation errors
  LogContext m_log_context;
  MessageFactory m_msg_factory;
  std::unique_ptr<IMessageMapper> m_msg_mapper;
  /// Map of message type to message handler functions
  static std::map<uint16_t, msg_fun_t> m_msg_handlers;
};

} // namespace Core
} // namespace SDMS

#endif
