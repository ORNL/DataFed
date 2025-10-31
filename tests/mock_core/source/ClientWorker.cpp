
// Local DataFed includes
#include "ClientWorker.hpp"
#include "Version.hpp"

#include "IMockCoreServer.hpp"
#include "MockGlobals.hpp"

// DataFed Common includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/ProtoBufMap.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"
#include "common/libjson.hpp"

// Proto files
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/Version.pb.h"

// Third party includes
#include <boost/tokenizer.hpp>

// Standard includes
#include <atomic>
#include <iostream>

using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace MockCore {

map<uint16_t, ClientWorker::msg_fun_t> ClientWorker::m_msg_handlers;

// TODO - This should be defined in proto files
#define NOTE_MASK_MD_ERR 0x2000

ClientWorker::ClientWorker(IMockCoreServer &a_core, size_t a_tid,
                           LogContext log_context_in)
    : m_config(Config::getInstance()), m_core(a_core), m_tid(a_tid),
      m_run(true), m_log_context(log_context_in),
      m_msg_mapper(std::unique_ptr<IMessageMapper>(new ProtoBufMap)) {
  setupMsgHandlers();
  LogContext log_context = m_log_context;
  log_context.thread_name +=
      std::to_string(log_context.thread_id) + "-WorkerThread";
  log_context.thread_id = 0;
  m_worker_thread = std::make_unique<std::thread>(&ClientWorker::workerThread,
                                                  this, log_context);
}

ClientWorker::~ClientWorker() {
  stop();
  wait();
}

bool ClientWorker::isRunning() const {
  std::lock_guard<mutex> lock(m_run_mutex);
  return m_run;
}

void ClientWorker::stop() {
  std::lock_guard<mutex> lock(m_run_mutex);
  m_run = false;
}

void ClientWorker::wait() {
  if (m_worker_thread) {
    m_worker_thread->join();
    // delete m_worker_thread;
    m_worker_thread = 0;
  }
}

#define SET_MSG_HANDLER(proto_id, msg, func)                                   \
  m_msg_handlers[m_msg_mapper->getMessageType(proto_id, #msg)] = func

/**
 * This method configures message handling by creating a map from message type
 * to handler function. There are currently two protocol levels: anonymous and
 * authenticated. Each is supported by a Google protobuf interface (in
 * /common/proto). Most requests can be handled directly by the DB (via
 * DatabaseAPI class), but some require local processing. This method maps the
 * two classes of requests using the macros SET_MSG_HANDLER (for local) and
 * SET_MSG_HANDLER_DB (for DB only).
 */
void ClientWorker::setupMsgHandlers() {
  static std::atomic_flag lock = ATOMIC_FLAG_INIT;

  // Only perform the processing once as it affects global state in the
  // messaging libraries
  if (lock.test_and_set())
    return;

  try {
    // Register and setup handlers for the Anonymous interface

    uint8_t proto_id = m_msg_mapper->getProtocolID(
        MessageProtocol::GOOGLE_ANONONYMOUS); // REG_PROTO( SDMS::Anon );
    // Requests that require the server to take action
    SET_MSG_HANDLER(proto_id, VersionRequest,
                    &ClientWorker::procVersionRequest);
    SET_MSG_HANDLER(proto_id, AuthenticateByTokenRequest,
                    &ClientWorker::procAuthenticateByTokenRequest);
    SET_MSG_HANDLER(proto_id, GetAuthStatusRequest,
                    &ClientWorker::procGetAuthStatusRequest);

    SET_MSG_HANDLER(proto_id, AuthenticateByPasswordRequest,
                    &ClientWorker::procAuthenticateByPasswordRequest);

    // Register and setup handlers for the Authenticated interface
    proto_id = m_msg_mapper->getProtocolID(MessageProtocol::GOOGLE_AUTHORIZED);
    SET_MSG_HANDLER(proto_id, RepoAuthzRequest,
                    &ClientWorker::procRepoAuthzRequest);

    SET_MSG_HANDLER(proto_id, RepoCreateRequest, &ClientWorker::procRepoCreate);

  } catch (TraceException &e) {
    DL_ERROR(m_log_context, "exception: " << e.toString());
    throw;
  }
}

/**
 * ClientWorker message handling thread.
 */
void ClientWorker::workerThread(LogContext log_context) {

  DL_DEBUG(log_context, "W" << m_tid << " thread started");
  CommunicatorFactory factory(log_context);

  const std::string client_id = "client_worker_" + std::to_string(m_tid);
  auto client = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.connection_security = SocketConnectionSecurity::INSECURE;
    socket_options.protocol_type = ProtocolType::ZQTP;
    socket_options.host = "workers";
    socket_options.local_id = client_id;

    std::unordered_map<CredentialType, std::string> cred_options;

    CredentialFactory cred_factory;
    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 1000;
    long timeout_on_poll = 1000;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  ProtoBufMap proto_map;
  uint16_t task_list_msg_type = proto_map.getMessageType(2, "TaskListRequest");

  DL_DEBUG(log_context, "W" << m_tid << " m_run " << m_run);

  LogContext message_log_context = log_context;
  while (isRunning()) {
    message_log_context.correlation_id = "";
    try {
      ICommunicator::Response response =
          client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
      if (response.time_out == false and response.error == false) {
        if (not response.message) {
          DL_ERROR(
              message_log_context,
              "No timeout or error was reported but message is not defined.")
        }

        IMessage &message = *response.message;
        uint16_t msg_type = std::get<uint16_t>(
            message.get(constants::message::google::MSG_TYPE));
        message_log_context.correlation_id = std::get<std::string>(
            message.get(MessageAttribute::CORRELATION_ID));
        DL_DEBUG(message_log_context, "W" << m_tid << " received message: "
                                          << proto_map.toString(msg_type));

        const std::string uid =
            std::get<std::string>(message.get(MessageAttribute::ID));
        if (msg_type != task_list_msg_type) {
          DL_DEBUG(message_log_context,
                   "W" << m_tid << " msg " << msg_type << " [" << uid << "]");
        }

        if (uid.compare("anon") == 0 && msg_type > 0x1FF) {
          DL_WARNING(message_log_context,
                     "W" << m_tid
                         << " unauthorized access attempt from anon user");
          auto response_msg = m_msg_factory.createResponseEnvelope(message);

          // I know this is not great... allocating memory here slow
          // This will need to be fixed
          auto nack = std::make_unique<Anon::NackReply>();
          nack->set_err_code(ID_AUTHN_REQUIRED);
          nack->set_err_msg("Authentication required");
          response_msg->setPayload(std::move(nack));
          client->send(*response_msg);
        } else {
          DL_DEBUG(message_log_context,
                   "W" << m_tid << " getting handler from map: msg_type = "
                       << proto_map.toString(msg_type));
          if (m_msg_handlers.count(msg_type)) {

            auto handler = m_msg_handlers.find(msg_type);

            DL_TRACE(message_log_context,
                     "W" << m_tid
                         << " calling handler/attempting to call "
                            "function of worker");

            // Have to move the actual unique_ptr, change ownership not simply
            // passing a reference
            auto response_msg = (this->*handler->second)(
                uid, std::move(response.message), message_log_context);
            if (response_msg) {
              // Gather msg metrics except on task lists (web clients poll)

              DL_DEBUG(message_log_context,
                       "W" << m_tid << " sending msg of type "
                           << proto_map.toString(msg_type));
              client->send(*response_msg);
              DL_TRACE(message_log_context, "Message sent ");
            }
          } else {
            DL_ERROR(message_log_context,
                     "W" << m_tid << " recvd unregistered msg: " << msg_type);
          }
        }
      }
    } catch (TraceException &e) {
      DL_ERROR(message_log_context, "W" << m_tid << " " << e.toString());
    } catch (exception &e) {
      DL_ERROR(message_log_context, "W" << m_tid << " " << e.what());
    } catch (...) {
      DL_ERROR(message_log_context, "W" << m_tid << " unknown exception type");
    }
  }

  DL_DEBUG(log_context, "W exiting loop");
}

// TODO The macros below should be replaced with templates

/// This macro defines the begining of the common message handling code for all
/// local handlers
#define PROC_MSG_BEGIN(msgclass, replyclass, log_context)                      \
  msgclass *request = 0;                                                       \
  bool send_reply = true;                                                      \
  ::google::protobuf::Message *base_msg =                                      \
      std::get<google::protobuf::Message *>(msg_request->getPayload());        \
  if (base_msg) {                                                              \
    request = dynamic_cast<msgclass *>(base_msg);                              \
    if (request) {                                                             \
      DL_TRACE(log_context, "Rcvd [" << request->DebugString() << "]");        \
      std::unique_ptr<google::protobuf::Message> reply_ptr =                   \
          std::make_unique<replyclass>();                                      \
      replyclass &reply = *(dynamic_cast<replyclass *>(reply_ptr.get()));      \
      try {

/// This macro defines the end of the common message handling code for all local
/// handlers

#define PROC_MSG_END(log_context)                                              \
  if (send_reply) {                                                            \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);       \
    msg_reply->setPayload(std::move(reply_ptr));                               \
    return msg_reply;                                                          \
  }                                                                            \
  }                                                                            \
  catch (TraceException & e) {                                                 \
    DL_ERROR(log_context, "W" << m_tid << " " << e.toString());                \
    if (send_reply) {                                                          \
      auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);     \
      auto nack = std::make_unique<NackReply>();                               \
      nack->set_err_code((ErrorCode)e.getErrorCode());                         \
      nack->set_err_msg(e.toString(true));                                     \
      msg_reply->setPayload(std::move(nack));                                  \
      return msg_reply;                                                        \
    }                                                                          \
  }                                                                            \
  catch (exception & e) {                                                      \
    DL_ERROR(log_context, "W" << m_tid << " " << e.what());                    \
    if (send_reply) {                                                          \
      auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);     \
      auto nack = std::make_unique<NackReply>();                               \
      nack->set_err_code(ID_INTERNAL_ERROR);                                   \
      nack->set_err_msg(e.what());                                             \
      msg_reply->setPayload(std::move(nack));                                  \
      return msg_reply;                                                        \
    }                                                                          \
  }                                                                            \
  catch (...) {                                                                \
    DL_ERROR(log_context,                                                      \
             "W" << m_tid << " unkown exception while processing message!");   \
    if (send_reply) {                                                          \
      auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);     \
      auto nack = std::make_unique<NackReply>();                               \
      nack->set_err_code(ID_INTERNAL_ERROR);                                   \
      nack->set_err_msg("Unknown exception type");                             \
      msg_reply->setPayload(std::move(nack));                                  \
      return msg_reply;                                                        \
    }                                                                          \
  }                                                                            \
  DL_TRACE(log_context, "Sent: " << reply.DebugString());                      \
  }                                                                            \
  else {                                                                       \
    DL_ERROR(log_context,                                                      \
             "W" << m_tid << ": dynamic cast of msg buffer failed!");          \
  }                                                                            \
  }                                                                            \
  else {                                                                       \
    DL_ERROR(log_context, "W" << m_tid                                         \
                              << ": message parse failed (malformed or "       \
                                 "unregistered msg type).");                   \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);       \
    auto nack = std::make_unique<NackReply>();                                 \
    nack->set_err_code(ID_BAD_REQUEST);                                        \
    nack->set_err_msg(                                                         \
        "Message parse failed (malformed or unregistered msg type)");          \
    msg_reply->setPayload(std::move(nack));                                    \
    return msg_reply;                                                          \
  }                                                                            \
  return std::unique_ptr<IMessage>();

std::unique_ptr<IMessage>
ClientWorker::procVersionRequest(const std::string &a_uid,
                                 std::unique_ptr<IMessage> &&msg_request,
                                 LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(VersionRequest, VersionReply, log_context)
  (void)a_uid;
  DL_INFO(log_context, "Version request received.");

  reply.set_release_year(DATAFED_RELEASE_YEAR);
  reply.set_release_month(DATAFED_RELEASE_MONTH);
  reply.set_release_day(DATAFED_RELEASE_DAY);
  reply.set_release_hour(DATAFED_RELEASE_HOUR);
  reply.set_release_minute(DATAFED_RELEASE_MINUTE);

  reply.set_api_major(DATAFED_COMMON_PROTOCOL_API_MAJOR);
  reply.set_api_minor(DATAFED_COMMON_PROTOCOL_API_MINOR);
  reply.set_api_patch(DATAFED_COMMON_PROTOCOL_API_PATCH);

  reply.set_component_major(MockCore::version::MAJOR);
  reply.set_component_minor(MockCore::version::MINOR);
  reply.set_component_patch(MockCore::version::PATCH);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRepoAuthzRequest(const std::string &a_uid,
                                   std::unique_ptr<IMessage> &&msg_request,
                                   LogContext log_context) {
  DL_INFO(log_context, "RepoAuthzRequest received.");
  (void)a_uid;
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoAuthzRequest, AckReply, log_context)

  DL_INFO(log_context, "AUTHZ repo request received: "
                           << a_uid << ", usr: " << request->client()
                           << ", file: " << request->file()
                           << ", act: " << request->action());

  EXCEPT(1, "This function needs to be mocked before testing repo request.");
  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procAuthenticateByPasswordRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  (void)a_uid;
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));

  PROC_MSG_BEGIN(AuthenticateByPasswordRequest, AuthStatusReply, log_context)

  DL_INFO(log_context,
          "Starting manual password authentication for " << request->uid());

  if (strcmp(request->password().c_str(), MockGlobals::test_user_password) ==
      0) {
    reply.set_uid(MockGlobals::authenticated_test_user);
    reply.set_auth(true);
  } else {

    DL_ERROR(m_log_context,
             "User is not authenticated - this is not the actual error: "
                 << request->uid());
  }
  DL_INFO(log_context,
          "Manual password authentication SUCCESS for " << reply.uid());

  m_core.authenticateClient(
      a_uid, std::get<std::string>(msg_request->get(MessageAttribute::KEY)),
      reply.uid(), log_context);

  PROC_MSG_END(log_context);
}
std::unique_ptr<IMessage> ClientWorker::procAuthenticateByTokenRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  (void)a_uid;
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(AuthenticateByTokenRequest, AuthStatusReply, log_context)

  DL_INFO(log_context, "Starting manual token authentication");

  if (strcmp(request->token().c_str(), MockGlobals::test_user_token) == 0) {
    reply.set_uid(MockGlobals::authenticated_test_user);
    reply.set_auth(true);
  } else {

    DL_ERROR(m_log_context,
             "User is not authenticated - this is not the actual error: "
                 << reply.uid());
  }
  DL_INFO(log_context,
          "Manual token authentication SUCCESS for " << reply.uid());

  // Token is passed in and compared with "token" value attached to user
  // document
  //
  // On success the database will return
  // {
  //     uid: 'u/good_bob',
  //     authorized: true
  // }
  //
  // If error will throw a 400 error with 'Authentication Failed' message

  DL_INFO(log_context,
          "Manual token authentication SUCCESS for " << reply.uid());

  m_core.authenticateClient(
      a_uid, std::get<std::string>(msg_request->get(MessageAttribute::KEY)),
      reply.uid(), log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procGetAuthStatusRequest(const std::string &a_uid,
                                       std::unique_ptr<IMessage> &&msg_request,
                                       LogContext log_context) {
  (void)a_uid;
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(GetAuthStatusRequest, AuthStatusReply, log_context)
  DL_INFO(log_context, "GetAuthStatusRequest received for " << a_uid);

  if (strcmp(a_uid.c_str(), MockGlobals::authenticated_test_user) == 0) {
    DL_INFO(log_context, a_uid << " authorized");
    reply.set_auth(true);
    reply.set_uid(a_uid);
  } else {
    DL_WARNING(log_context, a_uid << std::string(" not authorized"));
    reply.set_auth(false);
  }

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRepoCreate(const std::string &a_uid,
                             std::unique_ptr<IMessage> &&msg_request,
                             LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoCreateRequest, RepoDataReply, log_context)

  DL_INFO(log_context, "RepoCreate received for " << a_uid);
  RepoData repo;
  repo.set_id(MockGlobals::repo_id);
  repo.set_title(MockGlobals::repo_title);
  repo.set_desc(MockGlobals::repo_desc);
  repo.set_capacity(MockGlobals::repo_capacity);
  repo.set_address(MockGlobals::repo_listen_address);
  repo.set_endpoint(MockGlobals::repo_globus_uuid);
  repo.set_pub_key(MockGlobals::pub_repo_key);
  repo.set_path(MockGlobals::repo_path);
  repo.set_type(MockGlobals::repo_type);
  repo.add_admin(MockGlobals::authenticated_test_user);

  RepoData *repo_ptr = reply.add_repo();
  *repo_ptr = repo;
  DL_INFO(log_context, "RepoCreate type is " << repo.type());

  PROC_MSG_END(log_context);
}

} // namespace MockCore
} // namespace SDMS
