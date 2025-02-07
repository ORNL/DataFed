
// Local DataFed includes
#include "ClientWorker.hpp"
#include "TaskMgr.hpp"
#include "Version.hpp"

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

namespace Core {

map<uint16_t, ClientWorker::msg_fun_t> ClientWorker::m_msg_handlers;

// TODO - This should be defined in proto files
#define NOTE_MASK_MD_ERR 0x2000

ClientWorker::ClientWorker(ICoreServer &a_core, size_t a_tid,
                           LogContext log_context_in)
    : m_config(Config::getInstance()), m_core(a_core), m_tid(a_tid),
      m_run(true),
      m_db_client(m_config.db_url, m_config.db_user, m_config.db_pass),
      m_log_context(log_context_in) {
  // This should be hidden behind a factory or some other builder
  m_msg_mapper = std::unique_ptr<IMessageMapper>(new ProtoBufMap);
  setupMsgHandlers();
  LogContext log_context = m_log_context;
  log_context.thread_name +=
      std::to_string(log_context.thread_id) + "-WorkerThread";
  log_context.thread_id = 0;
  m_globus_api = std::move(GlobusAPI(log_context));
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
#define SET_MSG_HANDLER_DB(proto_id, rq, rp, func)                             \
  m_msg_handlers[m_msg_mapper->getMessageType(proto_id, #rq)] =                \
      &ClientWorker::dbPassThrough<rq, rp, &DatabaseAPI::func>

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
    SET_MSG_HANDLER(proto_id, AuthenticateByPasswordRequest,
                    &ClientWorker::procAuthenticateByPasswordRequest);
    SET_MSG_HANDLER(proto_id, AuthenticateByTokenRequest,
                    &ClientWorker::procAuthenticateByTokenRequest);
    SET_MSG_HANDLER(proto_id, GetAuthStatusRequest,
                    &ClientWorker::procGetAuthStatusRequest);

    // Requests that can be handled by DB client directly
    SET_MSG_HANDLER_DB(proto_id, DailyMessageRequest, DailyMessageReply,
                       dailyMessage);

    // Register and setup handlers for the Authenticated interface
    proto_id = m_msg_mapper->getProtocolID(MessageProtocol::GOOGLE_AUTHORIZED);

    // Requests that require the server to take action
    SET_MSG_HANDLER(proto_id, GenerateCredentialsRequest,
                    &ClientWorker::procGenerateCredentialsRequest);
    SET_MSG_HANDLER(proto_id, RevokeCredentialsRequest,
                    &ClientWorker::procRevokeCredentialsRequest);
    SET_MSG_HANDLER(proto_id, DataGetRequest,
                    &ClientWorker::procDataGetRequest);
    SET_MSG_HANDLER(proto_id, DataPutRequest,
                    &ClientWorker::procDataPutRequest);
    SET_MSG_HANDLER(proto_id, RecordCreateRequest,
                    &ClientWorker::procRecordCreateRequest);
    SET_MSG_HANDLER(proto_id, RecordUpdateRequest,
                    &ClientWorker::procRecordUpdateRequest);
    SET_MSG_HANDLER(proto_id, RecordUpdateBatchRequest,
                    &ClientWorker::procRecordUpdateBatchRequest);
    SET_MSG_HANDLER(proto_id, RecordDeleteRequest,
                    &ClientWorker::procRecordDeleteRequest);
    SET_MSG_HANDLER(proto_id, RecordAllocChangeRequest,
                    &ClientWorker::procRecordAllocChangeRequest);
    SET_MSG_HANDLER(proto_id, RecordOwnerChangeRequest,
                    &ClientWorker::procRecordOwnerChangeRequest);
    SET_MSG_HANDLER(proto_id, ProjectSearchRequest,
                    &ClientWorker::procProjectSearchRequest);
    SET_MSG_HANDLER(proto_id, CollDeleteRequest,
                    &ClientWorker::procCollectionDeleteRequest);
    SET_MSG_HANDLER(proto_id, ProjectDeleteRequest,
                    &ClientWorker::procProjectDeleteRequest);
    SET_MSG_HANDLER(proto_id, RepoAuthzRequest,
                    &ClientWorker::procRepoAuthzRequest);
    SET_MSG_HANDLER(proto_id, RepoAllocationCreateRequest,
                    &ClientWorker::procRepoAllocationCreateRequest);
    SET_MSG_HANDLER(proto_id, RepoAllocationDeleteRequest,
                    &ClientWorker::procRepoAllocationDeleteRequest);
    SET_MSG_HANDLER(proto_id, UserGetAccessTokenRequest,
                    &ClientWorker::procUserGetAccessTokenRequest);
    SET_MSG_HANDLER(proto_id, SchemaCreateRequest,
                    &ClientWorker::procSchemaCreateRequest);
    SET_MSG_HANDLER(proto_id, SchemaReviseRequest,
                    &ClientWorker::procSchemaReviseRequest);
    SET_MSG_HANDLER(proto_id, SchemaUpdateRequest,
                    &ClientWorker::procSchemaUpdateRequest);
    SET_MSG_HANDLER(proto_id, MetadataValidateRequest,
                    &ClientWorker::procMetadataValidateRequest);

    // Requires updating repo cache
    SET_MSG_HANDLER(proto_id, RepoCreateRequest, &ClientWorker::procRepoCreate);
    SET_MSG_HANDLER(proto_id, RepoUpdateRequest, &ClientWorker::procRepoUpdate);
    SET_MSG_HANDLER(proto_id, RepoDeleteRequest, &ClientWorker::procRepoDelete);

    // Requests that can be handled by DB client directly
    SET_MSG_HANDLER_DB(proto_id, CheckPermsRequest, CheckPermsReply,
                       checkPerms);
    SET_MSG_HANDLER_DB(proto_id, GetPermsRequest, GetPermsReply, getPerms);
    SET_MSG_HANDLER_DB(proto_id, UserViewRequest, UserDataReply, userView);
    SET_MSG_HANDLER_DB(proto_id, UserSetAccessTokenRequest, AckReply,
                       userSetAccessToken);
    SET_MSG_HANDLER_DB(proto_id, UserCreateRequest, UserDataReply, userCreate);
    SET_MSG_HANDLER_DB(proto_id, UserUpdateRequest, UserDataReply, userUpdate);
    SET_MSG_HANDLER_DB(proto_id, UserListAllRequest, UserDataReply,
                       userListAll);
    SET_MSG_HANDLER_DB(proto_id, UserListCollabRequest, UserDataReply,
                       userListCollab);
    SET_MSG_HANDLER_DB(proto_id, UserFindByUUIDsRequest, UserDataReply,
                       userFindByUUIDs);
    SET_MSG_HANDLER_DB(proto_id, UserFindByNameUIDRequest, UserDataReply,
                       userFindByNameUID);
    SET_MSG_HANDLER_DB(proto_id, UserGetRecentEPRequest, UserGetRecentEPReply,
                       userGetRecentEP);
    SET_MSG_HANDLER_DB(proto_id, UserSetRecentEPRequest, AckReply,
                       userSetRecentEP);
    SET_MSG_HANDLER_DB(proto_id, ProjectViewRequest, ProjectDataReply,
                       projView);
    SET_MSG_HANDLER_DB(proto_id, ProjectCreateRequest, ProjectDataReply,
                       projCreate);
    SET_MSG_HANDLER_DB(proto_id, ProjectUpdateRequest, ProjectDataReply,
                       projUpdate);
    SET_MSG_HANDLER_DB(proto_id, ProjectListRequest, ListingReply, projList);
    SET_MSG_HANDLER_DB(proto_id, ProjectGetRoleRequest, ProjectGetRoleReply,
                       projGetRole);
    SET_MSG_HANDLER_DB(proto_id, RecordViewRequest, RecordDataReply,
                       recordView);
    SET_MSG_HANDLER_DB(proto_id, RecordCreateBatchRequest, RecordDataReply,
                       recordCreateBatch);
    SET_MSG_HANDLER_DB(proto_id, RecordExportRequest, RecordExportReply,
                       recordExport);
    SET_MSG_HANDLER_DB(proto_id, RecordLockRequest, ListingReply, recordLock);
    SET_MSG_HANDLER_DB(proto_id, RecordListByAllocRequest, ListingReply,
                       recordListByAlloc);
    SET_MSG_HANDLER_DB(proto_id, RecordGetDependencyGraphRequest, ListingReply,
                       recordGetDependencyGraph);
    SET_MSG_HANDLER_DB(proto_id, SearchRequest, ListingReply, generalSearch);
    SET_MSG_HANDLER_DB(proto_id, DataPathRequest, DataPathReply, dataPath);
    SET_MSG_HANDLER_DB(proto_id, CollViewRequest, CollDataReply, collView);
    SET_MSG_HANDLER_DB(proto_id, CollReadRequest, ListingReply, collRead);
    SET_MSG_HANDLER_DB(proto_id, CollListPublishedRequest, ListingReply,
                       collListPublished);
    SET_MSG_HANDLER_DB(proto_id, CollCreateRequest, CollDataReply, collCreate);
    SET_MSG_HANDLER_DB(proto_id, CollUpdateRequest, CollDataReply, collUpdate);
    SET_MSG_HANDLER_DB(proto_id, CollWriteRequest, ListingReply, collWrite);
    SET_MSG_HANDLER_DB(proto_id, CollMoveRequest, AckReply, collMove);
    SET_MSG_HANDLER_DB(proto_id, CollGetParentsRequest, CollPathReply,
                       collGetParents);
    SET_MSG_HANDLER_DB(proto_id, CollGetOffsetRequest, CollGetOffsetReply,
                       collGetOffset);
    SET_MSG_HANDLER_DB(proto_id, QueryListRequest, ListingReply, queryList);
    SET_MSG_HANDLER_DB(proto_id, QueryViewRequest, QueryDataReply, queryView);
    SET_MSG_HANDLER_DB(proto_id, QueryExecRequest, ListingReply, queryExec);
    SET_MSG_HANDLER_DB(proto_id, QueryCreateRequest, QueryDataReply,
                       queryCreate);
    SET_MSG_HANDLER_DB(proto_id, QueryUpdateRequest, QueryDataReply,
                       queryUpdate);
    SET_MSG_HANDLER_DB(proto_id, QueryDeleteRequest, AckReply, queryDelete);
    SET_MSG_HANDLER_DB(proto_id, NoteViewRequest, NoteDataReply, noteView);
    SET_MSG_HANDLER_DB(proto_id, NoteListBySubjectRequest, NoteDataReply,
                       noteListBySubject);
    SET_MSG_HANDLER_DB(proto_id, NoteCreateRequest, NoteDataReply, noteCreate);
    SET_MSG_HANDLER_DB(proto_id, NoteUpdateRequest, NoteDataReply, noteUpdate);
    SET_MSG_HANDLER_DB(proto_id, NoteCommentEditRequest, NoteDataReply,
                       noteCommentEdit);
    SET_MSG_HANDLER_DB(proto_id, TaskListRequest, TaskDataReply, taskList);
    SET_MSG_HANDLER_DB(proto_id, TaskViewRequest, TaskDataReply, taskView);
    SET_MSG_HANDLER_DB(proto_id, ACLViewRequest, ACLDataReply, aclView);
    SET_MSG_HANDLER_DB(proto_id, ACLUpdateRequest, ACLDataReply, aclUpdate);
    SET_MSG_HANDLER_DB(proto_id, ACLSharedListRequest, ListingReply,
                       aclSharedList);
    SET_MSG_HANDLER_DB(proto_id, ACLSharedListItemsRequest, ListingReply,
                       aclSharedListItems);
    SET_MSG_HANDLER_DB(proto_id, GroupCreateRequest, GroupDataReply,
                       groupCreate);
    SET_MSG_HANDLER_DB(proto_id, GroupUpdateRequest, GroupDataReply,
                       groupUpdate);
    SET_MSG_HANDLER_DB(proto_id, GroupDeleteRequest, AckReply, groupDelete);
    SET_MSG_HANDLER_DB(proto_id, GroupListRequest, GroupDataReply, groupList);
    SET_MSG_HANDLER_DB(proto_id, GroupViewRequest, GroupDataReply, groupView);
    SET_MSG_HANDLER_DB(proto_id, RepoListRequest, RepoDataReply, repoList);
    SET_MSG_HANDLER_DB(proto_id, RepoViewRequest, RepoDataReply, repoView);
    SET_MSG_HANDLER_DB(proto_id, RepoCalcSizeRequest, RepoCalcSizeReply,
                       repoCalcSize);
    SET_MSG_HANDLER_DB(proto_id, RepoListAllocationsRequest,
                       RepoAllocationsReply, repoListAllocations);
    SET_MSG_HANDLER_DB(proto_id, RepoListSubjectAllocationsRequest,
                       RepoAllocationsReply, repoListSubjectAllocations);
    SET_MSG_HANDLER_DB(proto_id, RepoListObjectAllocationsRequest,
                       RepoAllocationsReply, repoListObjectAllocations);
    SET_MSG_HANDLER_DB(proto_id, RepoViewAllocationRequest,
                       RepoAllocationsReply, repoViewAllocation);
    SET_MSG_HANDLER_DB(proto_id, RepoAllocationSetRequest, AckReply,
                       repoAllocationSet);
    SET_MSG_HANDLER_DB(proto_id, RepoAllocationSetDefaultRequest, AckReply,
                       repoAllocationSetDefault);
    SET_MSG_HANDLER_DB(proto_id, RepoAllocationStatsRequest,
                       RepoAllocationStatsReply, repoAllocationStats);
    SET_MSG_HANDLER_DB(proto_id, SchemaSearchRequest, SchemaDataReply,
                       schemaSearch);
    SET_MSG_HANDLER_DB(proto_id, SchemaViewRequest, SchemaDataReply,
                       schemaView);
    SET_MSG_HANDLER_DB(proto_id, SchemaDeleteRequest, AckReply, schemaDelete);
    SET_MSG_HANDLER_DB(proto_id, TagSearchRequest, TagDataReply, tagSearch);
    SET_MSG_HANDLER_DB(proto_id, TagListByCountRequest, TagDataReply,
                       tagListByCount);
    SET_MSG_HANDLER_DB(proto_id, TopicListTopicsRequest, TopicDataReply,
                       topicListTopics);
    SET_MSG_HANDLER_DB(proto_id, TopicViewRequest, TopicDataReply, topicView);
    SET_MSG_HANDLER_DB(proto_id, TopicSearchRequest, TopicDataReply,
                       topicSearch);
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
              if (msg_type != task_list_msg_type)
                m_core.metricsUpdateMsgCount(uid, msg_type);

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

/// This method wraps all direct-to-DB message handler calls
template <typename RQ, typename RP,
          void (DatabaseAPI::*func)(const RQ &, RP &, LogContext log_context)>
std::unique_ptr<IMessage>
ClientWorker::dbPassThrough(const std::string &a_uid,
                            std::unique_ptr<IMessage> &&msg_request,
                            LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RQ, RP, log_context)

  m_db_client.setClient(a_uid);

  // Both request and reply here need to be Goolge protocol buffer classes
  (m_db_client.*func)(*request, reply, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRepoCreate(const std::string &a_uid,
                             std::unique_ptr<IMessage> &&msg_request,
                             LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoCreateRequest, RepoDataReply, log_context)

  m_db_client.setClient(a_uid);

  // Both request and reply here need to be Google protocol buffer classes
  m_db_client.repoCreate(*request, reply, log_context);

  m_config.triggerRepoCacheRefresh();
  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRepoUpdate(const std::string &a_uid,
                             std::unique_ptr<IMessage> &&msg_request,
                             LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoUpdateRequest, RepoDataReply, log_context)

  m_db_client.setClient(a_uid);
  // Both request and reply here need to be Google protocol buffer classes
  m_db_client.repoUpdate(*request, reply, log_context);

  m_config.triggerRepoCacheRefresh();
  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRepoDelete(const std::string &a_uid,
                             std::unique_ptr<IMessage> &&msg_request,
                             LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoDeleteRequest, AckReply, log_context)
  m_db_client.setClient(a_uid);

  // Both request and reply here need to be Google protocol buffer classes
  m_db_client.repoDelete(*request, reply, log_context);
  m_config.triggerRepoCacheRefresh();
  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procVersionRequest(const std::string &a_uid,
                                 std::unique_ptr<IMessage> &&msg_request,
                                 LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(VersionRequest, VersionReply, log_context)
  (void)a_uid;
  DL_TRACE(log_context, "Version request");

  reply.set_release_year(DATAFED_RELEASE_YEAR);
  reply.set_release_month(DATAFED_RELEASE_MONTH);
  reply.set_release_day(DATAFED_RELEASE_DAY);
  reply.set_release_hour(DATAFED_RELEASE_HOUR);
  reply.set_release_minute(DATAFED_RELEASE_MINUTE);

  reply.set_api_major(DATAFED_COMMON_PROTOCOL_API_MAJOR);
  reply.set_api_minor(DATAFED_COMMON_PROTOCOL_API_MINOR);
  reply.set_api_patch(DATAFED_COMMON_PROTOCOL_API_PATCH);

  reply.set_component_major(core::version::MAJOR);
  reply.set_component_minor(core::version::MINOR);
  reply.set_component_patch(core::version::PATCH);

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

  m_db_client.setClient(request->uid());
  m_db_client.clientAuthenticateByPassword(request->password(), reply,
                                           log_context);

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

  m_db_client.setClient(a_uid);
  m_db_client.clientAuthenticateByToken(request->token(), reply, log_context);

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

  if (strncmp(a_uid.c_str(), "anon", 4) == 0) {
    DL_WARNING(log_context, a_uid << std::string(" not authorized"));
    reply.set_auth(false);
  } else {
    DL_INFO(log_context, a_uid << " authorized");
    reply.set_auth(true);
    reply.set_uid(a_uid);
  }

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procGenerateCredentialsRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  (void)a_uid;
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(GenerateCredentialsRequest, GenerateCredentialsReply,
                 log_context)

  DL_INFO(log_context, "Generating new credentials for " << a_uid);

  m_db_client.setClient(a_uid);

  string pub_key, priv_key;

  if (!m_db_client.userGetKeys(pub_key, priv_key, log_context)) {
    char public_key[41];
    char secret_key[41];

    if (zmq_curve_keypair(public_key, secret_key) != 0)
      EXCEPT_PARAM(ID_SERVICE_ERROR,
                   "Key generation failed: " << zmq_strerror(errno));

    pub_key = public_key;
    priv_key = secret_key;

    m_db_client.userSetKeys(pub_key, priv_key, log_context);
  }

  reply.set_pub_key(pub_key);
  reply.set_priv_key(priv_key);

  if (request->has_domain() && request->has_uid()) {
    m_db_client.clientLinkIdentity(
        request->domain() + "." + to_string(request->uid()), log_context);
  }

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procRevokeCredentialsRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  (void)a_uid;
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RevokeCredentialsRequest, AckReply, log_context)

  DL_INFO(log_context, "Revoking credentials for " << a_uid);

  m_db_client.setClient(a_uid);
  m_db_client.userClearKeys(log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procDataGetRequest(const std::string &a_uid,
                                 std::unique_ptr<IMessage> &&msg_request,
                                 LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(DataGetRequest, DataGetReply, log_context)

  DL_DEBUG(log_context, "procDataGetRequest, uid: " << a_uid);

  libjson::Value result;

  m_db_client.setClient(a_uid);
  m_db_client.taskInitDataGet(*request, reply, result, log_context);
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procDataPutRequest(const std::string &a_uid,
                                 std::unique_ptr<IMessage> &&msg_request,
                                 LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(DataPutRequest, DataPutReply, log_context)

  DL_DEBUG(log_context, "procDataPutRequest, uid: " << a_uid);

  libjson::Value result;

  m_db_client.setClient(a_uid);
  m_db_client.taskInitDataPut(*request, reply, result, log_context);
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

void ClientWorker::schemaEnforceRequiredProperties(
    const nlohmann::json &a_schema) {
  // json_schema validator does not check for required fields in schema
  // Must include properties and type: Object
  if (!a_schema.is_object())
    EXCEPT(1, "Schema must be a JSON object.");

  nlohmann::json::const_iterator i = a_schema.find("properties");

  if (i == a_schema.end())
    EXCEPT(1, "Schema is missing required 'properties' field.");

  if (!i.value().is_object())
    EXCEPT(1, "Schema properties field must be a JSON object.");

  i = a_schema.find("type");

  if (i == a_schema.end())
    EXCEPT(1, "Schema is missing required 'type' field.");

  if (!i.value().is_string() || i.value().get<string>() != "object")
    EXCEPT(1, "Schema type must be 'object'.");
}

std::unique_ptr<IMessage>
ClientWorker::procSchemaCreateRequest(const std::string &a_uid,
                                      std::unique_ptr<IMessage> &&msg_request,
                                      LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(SchemaCreateRequest, AckReply, log_context)

  m_db_client.setClient(a_uid);

  DL_DEBUG(log_context, "Schema create");

  try {
    nlohmann::json schema = nlohmann::json::parse(request->def());

    schemaEnforceRequiredProperties(schema);

    nlohmann::json_schema::json_validator validator(
        bind(&ClientWorker::schemaLoader, this, placeholders::_1,
             placeholders::_2, log_context));

    validator.set_root_schema(schema);

    m_db_client.schemaCreate(*request, log_context);
  } catch (exception &e) {
    DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
    EXCEPT_PARAM(1, "Invalid metadata schema: " << e.what());
  }

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procSchemaReviseRequest(const std::string &a_uid,
                                      std::unique_ptr<IMessage> &&msg_request,
                                      LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(SchemaReviseRequest, AckReply, log_context)

  m_db_client.setClient(a_uid);

  DL_DEBUG(log_context, "Schema revise");

  if (request->has_def()) {
    try {
      nlohmann::json schema = nlohmann::json::parse(request->def());

      schemaEnforceRequiredProperties(schema);

      nlohmann::json_schema::json_validator validator(
          bind(&ClientWorker::schemaLoader, this, placeholders::_1,
               placeholders::_2, log_context));

      validator.set_root_schema(schema);
    } catch (exception &e) {
      DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
      EXCEPT_PARAM(1, "Invalid metadata schema: " << e.what());
    }
  }

  m_db_client.schemaRevise(*request, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procSchemaUpdateRequest(const std::string &a_uid,
                                      std::unique_ptr<IMessage> &&msg_request,
                                      LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(SchemaUpdateRequest, AckReply, log_context)

  m_db_client.setClient(a_uid);

  DL_DEBUG(log_context, "Schema update");

  if (request->has_def()) {
    try {
      nlohmann::json schema = nlohmann::json::parse(request->def());

      schemaEnforceRequiredProperties(schema);

      nlohmann::json_schema::json_validator validator(
          bind(&ClientWorker::schemaLoader, this, placeholders::_1,
               placeholders::_2, log_context));

      validator.set_root_schema(schema);
    } catch (exception &e) {
      DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
      EXCEPT_PARAM(1, "Invalid metadata schema: " << e.what());
    }
  }

  m_db_client.schemaUpdate(*request, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procMetadataValidateRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {

  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(MetadataValidateRequest, MetadataValidateReply, log_context)

  DL_DEBUG(log_context, "Metadata validate");

  m_db_client.setClient(a_uid);

  nlohmann::json schema;

  try {
    libjson::Value sch;
    DL_TRACE(log_context, "Schema " << request->sch_id());

    m_db_client.schemaView(request->sch_id(), sch, log_context);

    DL_TRACE(
        log_context,
        "Schema: "
            << sch.asArray().begin()->asObject().getValue("def").toString());

    schema = nlohmann::json::parse(
        sch.asArray().begin()->asObject().getValue("def").toString());
  } catch (TraceException &e) {
    DL_ERROR(log_context, "Schema validate failure: " << e.what());
    throw;
  } catch (exception &e) {
    EXCEPT_PARAM(1, "Schema parse error: " << e.what());
  }

  nlohmann::json_schema::json_validator validator(
      bind(&ClientWorker::schemaLoader, this, placeholders::_1,
           placeholders::_2, log_context));
  try {
    validator.set_root_schema(schema);

    nlohmann::json md = nlohmann::json::parse(request->metadata());

    m_validator_err.clear();
    validator.validate(md, *this);
  } catch (exception &e) {
    m_validator_err = string("Invalid metadata schema: ") + e.what() + "\n";
    DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
  }

  if (m_validator_err.size()) {
    reply.set_errors(m_validator_err);
  }

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRecordCreateRequest(const std::string &a_uid,
                                      std::unique_ptr<IMessage> &&msg_request,
                                      LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RecordCreateRequest, RecordDataReply, log_context)

  m_db_client.setClient(a_uid);

  // Validate metdata if present

  DL_DEBUG(log_context, "Creating record");

  m_validator_err.clear();

  if (request->has_sch_enforce() &&
      !(request->has_metadata() && request->has_sch_id())) {
    EXCEPT(1, "Enforce schema option specified, but metadata and/or schema ID "
              "is missing.");
  }

  if (request->has_metadata() && request->has_sch_id()) {

    nlohmann::json schema;

    try {
      libjson::Value sch;
      m_db_client.schemaView(request->sch_id(), sch, log_context);
      schema = nlohmann::json::parse(
          sch.asArray().begin()->asObject().getValue("def").toString());

      nlohmann::json_schema::json_validator validator(
          bind(&ClientWorker::schemaLoader, this, placeholders::_1,
               placeholders::_2, log_context));

      try {
        validator.set_root_schema(schema);

        nlohmann::json md = nlohmann::json::parse(request->metadata());

        m_validator_err.clear();
        validator.validate(md, *this);
      } catch (exception &e) {
        m_validator_err = string("Invalid metadata schema: ") + e.what() + "\n";
        DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
      }
    } catch (exception &e) {
      m_validator_err = string("Metadata schema error: ") + e.what() + "\n";
      DL_ERROR(log_context, "Could not load metadata schema: " << e.what());
    }

    if (request->has_sch_enforce() && m_validator_err.size()) {
      EXCEPT(1, m_validator_err);
    }
  }

  m_db_client.recordCreate(*request, reply, log_context);

  if (m_validator_err.size()) {
    DL_ERROR(log_context, "Validation error - update record");

    RecordData *data = reply.mutable_data(0);

    m_db_client.recordUpdateSchemaError(data->id(), m_validator_err,
                                        log_context);
    // TODO need a def for md_err mask
    data->set_notes(data->notes() | NOTE_MASK_MD_ERR);
    data->set_md_err_msg(m_validator_err);
  }

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRecordUpdateRequest(const std::string &a_uid,
                                      std::unique_ptr<IMessage> &&msg_request,
                                      LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RecordUpdateRequest, RecordDataReply, log_context)

  m_db_client.setClient(a_uid);

  // Validate metdata if present

  libjson::Value result;

  DL_DEBUG(log_context, "Updating record");

  m_validator_err.clear();

  if (request->has_metadata() ||
      (request->has_sch_id() && request->sch_id().size()) ||
      request->has_sch_enforce()) {
    string metadata, cur_metadata, sch_id;
    bool merge = true;

    if (request->has_mdset() && request->mdset())
      merge = false;

    if (!request->has_metadata() || merge || !request->has_sch_id()) {
      // Request does not include metadata AND schema, or it's a merge, so must
      // load the missing parts from DB before validation can be done.

      RecordViewRequest view_request;
      RecordDataReply view_reply;

      view_request.set_id(request->id());

      m_db_client.recordView(view_request, view_reply, log_context);

      if (request->has_metadata() && merge) {
        metadata = request->metadata();
        cur_metadata = view_reply.data(0).metadata();
      } else if (request->has_metadata()) {
        metadata = request->metadata();
      } else {
        metadata = view_reply.data(0).metadata();
      }

      if (!request->has_sch_id())
        sch_id = view_reply.data(0).sch_id();
      else
        sch_id = request->sch_id();
    } else {
      // metadata and schema ID are both in request AND it is not a merge
      // operation
      metadata = request->metadata();
      sch_id = request->sch_id();
    }

    if (metadata.size() && sch_id.size()) {
      DL_TRACE(log_context, "Must validate JSON, schema " << sch_id);

      libjson::Value sch;
      m_db_client.schemaView(sch_id, sch, log_context);

      DL_TRACE(log_context, "Schema record JSON:" << sch.toString());

      nlohmann::json schema = nlohmann::json::parse(
          sch.asArray().begin()->asObject().getValue("def").toString());

      DL_TRACE(log_context, "Schema nlohmann: " << schema);

      nlohmann::json_schema::json_validator validator(
          bind(&ClientWorker::schemaLoader, this, placeholders::_1,
               placeholders::_2, log_context));

      try {
        validator.set_root_schema(schema);

        // TODO This is a hacky way to convert between JSON implementations...

        nlohmann::json md = nlohmann::json::parse(metadata);

        // Apply merge patch if needed
        if (cur_metadata.size()) {
          nlohmann::json cur_md = nlohmann::json::parse(cur_metadata);
          cur_md.merge_patch(md);
          md = cur_md;
        }

        validator.validate(md, *this);
      } catch (exception &e) {
        m_validator_err = string("Invalid metadata schema: ") + e.what() + "\n";
        DL_WARNING(log_context, "Invalid metadata schema: " << e.what());
      }

      if (request->has_sch_enforce() && m_validator_err.size()) {
        EXCEPT(1, m_validator_err);
      }
    } else if (request->has_sch_enforce()) {
      EXCEPT(1, "Enforce schema option specified, but metadata and/or schema "
                "ID is missing.");
    }
  }

  m_db_client.recordUpdate(*request, reply, result, log_context);

  if (m_validator_err.size()) {
    DL_WARNING(log_context,
               "Validation error - while attempting to update record");

    m_db_client.recordUpdateSchemaError(request->id(), m_validator_err,
                                        log_context);
    // Must find and update md_err flag in reply (always 1 data entry)
    RecordData *data = reply.mutable_data(0);
    data->set_notes(data->notes() | NOTE_MASK_MD_ERR);
    data->set_md_err_msg(m_validator_err);

    for (int i = 0; i < reply.update_size(); i++) {
      ListingData *data = reply.mutable_update(i);
      if (data->id() == request->id()) {
        // TODO need a def for md_err mask
        data->set_notes(data->notes() | NOTE_MASK_MD_ERR);
        break;
      }
    }
  }

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procRecordUpdateBatchRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RecordUpdateBatchRequest, RecordDataReply, log_context)

  m_db_client.setClient(a_uid);

  libjson::Value result;

  m_db_client.recordUpdateBatch(*request, reply, result, log_context);

  DL_DEBUG(log_context, "procRecordUpdateBatchRequest, uid: " << a_uid);
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRecordDeleteRequest(const std::string &a_uid,
                                      std::unique_ptr<IMessage> &&msg_request,
                                      LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RecordDeleteRequest, TaskDataReply, log_context)

  m_db_client.setClient(a_uid);

  vector<string> ids;

  ids.reserve(request->id_size());
  for (int i = 0; i < request->id_size(); i++)
    ids.push_back(request->id(i));

  recordCollectionDelete(ids, reply, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procCollectionDeleteRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(CollDeleteRequest, TaskDataReply, log_context)

  m_db_client.setClient(a_uid);

  vector<string> ids;

  ids.reserve(request->id_size());
  for (int i = 0; i < request->id_size(); i++)
    ids.push_back(request->id(i));

  recordCollectionDelete(ids, reply, log_context);

  PROC_MSG_END(log_context);
}

void ClientWorker::recordCollectionDelete(const std::vector<std::string> &a_ids,
                                          TaskDataReply &a_reply,
                                          LogContext log_context) {
  libjson::Value result;

  m_db_client.taskInitRecordCollectionDelete(a_ids, a_reply, result,
                                             log_context);

  DL_DEBUG(log_context, "recordCollectionDelete ");
  handleTaskResponse(result, log_context);
}

std::unique_ptr<IMessage> ClientWorker::procRecordAllocChangeRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RecordAllocChangeRequest, RecordAllocChangeReply, log_context)

  m_db_client.setClient(a_uid);

  libjson::Value result;

  m_db_client.taskInitRecordAllocChange(*request, reply, result, log_context);

  DL_DEBUG(log_context, "procRecordAllocChangeRequest ");
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procRecordOwnerChangeRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RecordOwnerChangeRequest, RecordOwnerChangeReply, log_context)

  m_db_client.setClient(a_uid);

  libjson::Value result;

  m_db_client.taskInitRecordOwnerChange(*request, reply, result, log_context);

  DL_DEBUG(log_context, "procOwnerChangeRequest ");
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procProjectDeleteRequest(const std::string &a_uid,
                                       std::unique_ptr<IMessage> &&msg_request,
                                       LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(ProjectDeleteRequest, TaskDataReply, log_context)

  m_db_client.setClient(a_uid);

  libjson::Value result;

  m_db_client.taskInitProjectDelete(*request, reply, result, log_context);

  DL_DEBUG(log_context, "procProjectDeleteRequest ");
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procRepoAllocationCreateRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoAllocationCreateRequest, TaskDataReply, log_context)

  m_db_client.setClient(a_uid);

  libjson::Value result;

  m_db_client.taskInitRepoAllocationCreate(*request, reply, result,
                                           log_context);

  DL_DEBUG(log_context, "procRepoAllocationCreateRequest ");
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procRepoAllocationDeleteRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoAllocationDeleteRequest, TaskDataReply, log_context)

  m_db_client.setClient(a_uid);

  libjson::Value result;

  m_db_client.taskInitRepoAllocationDelete(*request, reply, result,
                                           log_context);

  DL_DEBUG(log_context, "procRepoAllocationDeleteRequest ");
  handleTaskResponse(result, log_context);

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procProjectSearchRequest(const std::string &a_uid,
                                       std::unique_ptr<IMessage> &&msg_request,
                                       LogContext log_context) {
  (void)a_uid;

  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(ProjectSearchRequest, ProjectDataReply, log_context)

  EXCEPT(1, "Not implemented");

  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage>
ClientWorker::procRepoAuthzRequest(const std::string &a_uid,
                                   std::unique_ptr<IMessage> &&msg_request,
                                   LogContext log_context) {
  (void)a_uid;
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(RepoAuthzRequest, AckReply, log_context)

  DL_DEBUG(log_context, "AUTHZ repo: " << a_uid
                                       << ", usr: " << request->client()
                                       << ", file: " << request->file()
                                       << ", act: " << request->action());

  m_db_client.setClient(request->client());
  m_db_client.repoAuthz(*request, reply, log_context);
  PROC_MSG_END(log_context);
}

std::unique_ptr<IMessage> ClientWorker::procUserGetAccessTokenRequest(
    const std::string &a_uid, std::unique_ptr<IMessage> &&msg_request,
    LogContext log_context) {
  log_context.correlation_id =
      std::get<std::string>(msg_request->get(MessageAttribute::CORRELATION_ID));
  PROC_MSG_BEGIN(UserGetAccessTokenRequest, UserAccessTokenReply, log_context)

  string acc_tok, ref_tok;
  uint32_t expires_in;
  bool needs_consent;
  int token_type;
  string scopes;

  string collection_id;
  string collection_type;

  if (request->has_collection_type()) {
    collection_type = request->collection_type();
  }
  if (request->has_collection_id()) {
    collection_id = request->collection_id();
  }

  m_db_client.setClient(a_uid);
  m_db_client.userGetAccessToken(acc_tok, ref_tok, expires_in, collection_id,
                                 collection_type, needs_consent, token_type,
                                 scopes, log_context);

  if (needs_consent) {
    // short circuit to reply
  } else if (expires_in < 300) {
    DL_INFO(log_context, "Refreshing access token for " << a_uid);
    if (token_type == AccessTokenType::GLOBUS_DEFAULT) {
      m_globus_api.refreshAccessToken(ref_tok, acc_tok, expires_in);
      m_db_client.userSetAccessToken(acc_tok, expires_in, ref_tok, log_context);
    } else {
      try {
        m_globus_api.refreshAccessToken(ref_tok, acc_tok, expires_in);
        m_db_client.userSetAccessToken(
            acc_tok, expires_in, ref_tok, (AccessTokenType)token_type,
            collection_id + "|" + scopes, log_context);
      } catch (TraceException &e) { // NOTE: assumes refresh failed (invalid or
                                    // failure). new token fetched will upsert
                                    // and overwrite old values on database
        needs_consent = true;
      }
    }
  }

  reply.set_access(acc_tok);
  reply.set_expires_in(expires_in);
  reply.set_needs_consent(needs_consent);

  PROC_MSG_END(log_context);
}

void ClientWorker::handleTaskResponse(libjson::Value &a_result,
                                      LogContext log_context) {
  libjson::Value::Object &obj = a_result.asObject();

  if (obj.has("task")) {
    libjson::Value::Object &task_obj = obj.asObject();

    if (task_obj.getNumber("status") != TS_BLOCKED) {
      DL_DEBUG(log_context, "handleTaskResponse status is: "
                                << task_obj.getNumber("status"));
      TaskMgr::getInstance().newTask(task_obj.getString("_id"), log_context);
    }
  }
}

void ClientWorker::schemaLoader(const nlohmann::json_uri &a_uri,
                                nlohmann::json &a_value,
                                LogContext log_context) {
  DL_DEBUG(log_context, "Load schema, scheme: "
                            << a_uri.scheme() << ", path: " << a_uri.path()
                            << ", auth: " << a_uri.authority()
                            << ", id: " << a_uri.identifier());

  libjson::Value sch;
  std::string id = a_uri.path();

  id = id.substr(1); // Skip leading "/"
  m_db_client.schemaView(id, sch, log_context);

  a_value = nlohmann::json::parse(
      sch.asArray().begin()->asObject().getValue("def").toString());
  DL_TRACE(log_context, "Loaded schema: " << a_value);
}

} // namespace Core
} // namespace SDMS
