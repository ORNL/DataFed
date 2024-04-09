// Local private includes
#include "RequestWorker.hpp"
#include "Version.hpp"

// Common public includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/ProtoBufMap.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// Proto includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/Version.pb.h"

// Third party includes
#include <boost/filesystem.hpp>

// Standard includes
#include <atomic>
#include <iostream>

using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace Repo {

map<uint16_t, RequestWorker::msg_fun_t> RequestWorker::m_msg_handlers;

bool RequestWorker::prefixesEqual(const std::string& str1, const std::string& str2, size_t length) const {
    // Check if either string is shorter than the specified length
    if (str1.length() < length || str2.length() < length) {
        return false;
		}
    
    // Use std::equal to compare the prefixes
    return std::equal(str1.begin(), str1.begin() + length, str2.begin());
}

std::string RequestWorker::createSanitizedPath(const std::string& path) const {

    string sanitized_request_path = path;
    while (!sanitized_request_path.empty()) {
      if (sanitized_request_path.back() == '/') {
        sanitized_request_path.pop_back();
      } else {
        break;
      }
    }
    /** 
     * When item is provided it is allowed to be provided as
     *
     * path = '/relative_path/to/file'
     *
     * or
     *
     * path = 'globus_collection_path/relative_path/to/file
     *
     * If a relative path is applied then the config settings are used and
     * the globus collection path is prepended. Otherwise if the the absolute
     * path is provided then no change is made.
     * 
     * E.g. 
     * 
     * Assuming 
     * path = "/datafed-home"
     * globus_collection_path = "/mnt/datafed"
     *
     * Then
     * local_path = "/mnt/datafed/datafed-home"
		 * 
     * Else if
     * 
     * path = "/mnt/datafed/datafed-home"
     * globus_collection_path = "/mnt/datafed"
     *
     * Then it won't prepend
     * local_path = "/mnt/datafed/datafed-home"
     **/
		string local_path;
   	if ( prefixesEqual(
           sanitized_request_path,
           m_config.globus_collection_path,
           m_config.globus_collection_path.length()) ) {

			/**
			 * If both paths exist throw an error indicating there is ambiguity. I.e.
       * 
       * If both
       * /datafed/datafed/file1.txt
       * /datafed/file1.txt
       *
       * exist and the variables are 
       * 
       * globus_collectin_path = "/datafed"
       * path = "/datafed/file1.txt" 
       * 
       * First off something with the configuration is likely off and secondly
       * It's impossible to determine which file is correct.
       *
			 **/
			std::string local_path_1 = m_config.globus_collection_path;
			std::string local_path_2 = "";
			if (sanitized_request_path.front() != '/') {
			  if (local_path_1.back() != '/') {
          local_path_1 += "/" + sanitized_request_path;
        } else {
          local_path_1 += sanitized_request_path;
        }
				local_path_2 += "/" + sanitized_request_path;
			} else {
				local_path_1 += sanitized_request_path;
				local_path_2 += sanitized_request_path;
			}

    	boost::filesystem::path data_path_1(local_path_1); // long 
    	boost::filesystem::path data_path_2(local_path_2); // shorter

			if (boost::filesystem::exists(data_path_1) and boost::filesystem::exists(data_path_2) ){
        // If they are the exact same then ignore else throw an error
        //
        // i.e. if globus_collection_path is /
        if( local_path_1 != local_path_2 ){ 
          DL_ERROR(m_log_context,
              "RequestWorker::createSanitizedPath, exception: something is really wrong both path " << local_path_1 << " and path " << local_path_2 << " exists, which makes unambiguously determining the correct paths impossible.");
          throw;
        }

			}

			// Use the shorter path
			local_path = local_path_2;	
		} else {
			local_path = m_config.globus_collection_path;
			if (sanitized_request_path.front() != '/') {
				local_path += "/" + sanitized_request_path;
			} else {
				local_path += sanitized_request_path;
			}
		}

		return local_path;
}

RequestWorker::RequestWorker(size_t a_tid, LogContext log_context)
    : m_config(Config::getInstance()), m_tid(a_tid), m_run(true),
      m_log_context(log_context) {

  m_msg_mapper = std::unique_ptr<IMessageMapper>(new ProtoBufMap);
  DL_DEBUG(m_log_context, "Setting up message handlers.");
  setupMsgHandlers();
  DL_DEBUG(m_log_context, "Creating worker thread.");
  m_worker_thread =
      std::make_unique<thread>(&RequestWorker::workerThread, this, log_context);
}

RequestWorker::~RequestWorker() {
  stop();
  wait();
}

void RequestWorker::stop() { m_run = false; }

void RequestWorker::wait() {
  if (m_worker_thread) {
    m_worker_thread->join();
  }
}

#define SET_MSG_HANDLER(proto_id, msg, func)                                   \
  m_msg_handlers[m_msg_mapper->getMessageType(proto_id, #msg)] = func

void RequestWorker::setupMsgHandlers() {
  static std::atomic_flag lock = ATOMIC_FLAG_INIT;

  if (lock.test_and_set())
    return;

  try {

    uint8_t proto_id =
        m_msg_mapper->getProtocolID(MessageProtocol::GOOGLE_ANONONYMOUS);

    SET_MSG_HANDLER(proto_id, VersionRequest,
                    &RequestWorker::procVersionRequest);

    proto_id = m_msg_mapper->getProtocolID(MessageProtocol::GOOGLE_AUTHORIZED);

    SET_MSG_HANDLER(proto_id, RepoDataDeleteRequest,
                    &RequestWorker::procDataDeleteRequest);
    SET_MSG_HANDLER(proto_id, RepoDataGetSizeRequest,
                    &RequestWorker::procDataGetSizeRequest);
    SET_MSG_HANDLER(proto_id, RepoPathCreateRequest,
                    &RequestWorker::procPathCreateRequest);
    SET_MSG_HANDLER(proto_id, RepoPathDeleteRequest,
                    &RequestWorker::procPathDeleteRequest);
  } catch (TraceException &e) {
    DL_ERROR(m_log_context,
             "RequestWorker::setupMsgHandlers, exception: " << e.toString());
    throw;
  }
}

void RequestWorker::workerThread(LogContext log_context) {

  log_context.thread_name += "-worker_thread";
  log_context.thread_id = m_tid;
  DL_DEBUG(log_context, "Thread started");

  std::string repo_thread_id =
      "repository_client_socket_" + std::to_string(m_tid);
  auto client = [&](const std::string &socket_id) {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP;
    socket_options.connection_security = SocketConnectionSecurity::INSECURE;
    socket_options.host = "workers";
    socket_options.local_id = socket_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    CommunicatorFactory factory(log_context);
    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }(repo_thread_id);

  DL_TRACE(log_context, "Listening on address " << client->address());

  while (m_run) {
    DL_TRACE(log_context, "Listening on address " << client->address());
    try {

      DL_TRACE(log_context, "Getting response.");
      ICommunicator::Response response =
          client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
      LogContext message_log_context = log_context;

      DL_TRACE(message_log_context, "Checking timeouts: " << response.time_out);
      if (response.time_out == false and response.error == false) {
        if (not response.message) {
          DL_ERROR(log_context, "Error: No error or timeout occurred but the"
                                    << " message does not exist.");
        } else {
          // May not have a correlation id if the message timed out
          DL_TRACE(log_context, "Getting correlation_id.");
          if (response.message->exists(MessageAttribute::CORRELATION_ID)) {
            message_log_context.correlation_id = std::get<std::string>(
                response.message->get(MessageAttribute::CORRELATION_ID));
          }

          IMessage &message = *response.message;
          uint16_t msg_type = std::get<uint16_t>(
              message.get(constants::message::google::MSG_TYPE));

          DL_TRACE(message_log_context, "Received msg of type: " << msg_type);

          if (m_msg_handlers.count(msg_type)) {
            map<uint16_t, msg_fun_t>::iterator handler =
                m_msg_handlers.find(msg_type);
            DL_TRACE(message_log_context, "Calling handler");

            auto send_message =
                (this->*handler->second)(std::move(response.message));

            client->send(*(send_message));

            DL_TRACE(message_log_context, "Reply sent.");
          } else {
            DL_ERROR(message_log_context,
                     "Received unregistered msg type: " << msg_type);
          }
        }
      } else if (response.error) {
        DL_DEBUG(message_log_context, "Error detected: " << response.error_msg);
      }
    } catch (TraceException &e) {
      DL_ERROR(log_context, "Error: " << e.toString());
    } catch (exception &e) {
      DL_ERROR(log_context, "Error: " << e.what());
    } catch (...) {
      DL_ERROR(log_context, "Unknown exception type.");
    }
  }

  DL_DEBUG(log_context, "Thread exiting.");
}

#define PROC_MSG_BEGIN(msgclass, replyclass)                                   \
  msgclass *request = 0;                                                       \
  ::google::protobuf::Message *base_msg =                                      \
      std::get<google::protobuf::Message *>(msg_request->getPayload());        \
  LogContext message_log_context = m_log_context;                              \
  message_log_context.correlation_id = std::get<std::string>(                  \
      msg_request->get(MessageAttribute::CORRELATION_ID));                     \
  if (base_msg) {                                                              \
    request = dynamic_cast<msgclass *>(base_msg);                              \
    if (request) {                                                             \
      DL_TRACE(message_log_context,                                            \
               "Received [" << request->DebugString() << "]");                 \
      std::unique_ptr<google::protobuf::Message> reply_ptr =                   \
          std::make_unique<replyclass>();                                      \
      replyclass &reply = *(dynamic_cast<replyclass *>(reply_ptr.get()));      \
      try {

#define PROC_MSG_END                                                           \
  auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);         \
  msg_reply->setPayload(std::move(reply_ptr));                                 \
  return msg_reply;                                                            \
  }                                                                            \
  catch (TraceException & e) {                                                 \
    DL_ERROR(message_log_context, "Error: " << e.toString());                  \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);       \
    auto nack = std::make_unique<NackReply>();                                 \
    nack->set_err_code((ErrorCode)e.getErrorCode());                           \
    nack->set_err_msg(e.toString(true));                                       \
    msg_reply->setPayload(std::move(nack));                                    \
    return msg_reply;                                                          \
  }                                                                            \
  catch (exception & e) {                                                      \
    DL_ERROR(message_log_context, "Error: " << e.what());                      \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);       \
    auto nack = std::make_unique<NackReply>();                                 \
    nack->set_err_code(ID_INTERNAL_ERROR);                                     \
    nack->set_err_msg(e.what());                                               \
    msg_reply->setPayload(std::move(nack));                                    \
    return msg_reply;                                                          \
  }                                                                            \
  catch (...) {                                                                \
    DL_ERROR(message_log_context,                                              \
             "Error unkown exception while processing message!");              \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);       \
    auto nack = std::make_unique<NackReply>();                                 \
    nack->set_err_code(ID_INTERNAL_ERROR);                                     \
    nack->set_err_msg("Unknown exception type");                               \
    msg_reply->setPayload(std::move(nack));                                    \
    return msg_reply;                                                          \
  }                                                                            \
  }                                                                            \
  else {                                                                       \
    DL_ERROR(message_log_context, "Dynamic cast of msg buffer failed!");       \
  }                                                                            \
  }                                                                            \
  else {                                                                       \
    DL_ERROR(message_log_context,                                              \
             "Message parse failed (malformed or unregistered msg type).");    \
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
RequestWorker::procVersionRequest(std::unique_ptr<IMessage> &&msg_request) {

  PROC_MSG_BEGIN(VersionRequest, VersionReply)

  DL_DEBUG(message_log_context, "Version request.");

  reply.set_release_year(Version::DATAFED_RELEASE_YEAR);
  reply.set_release_month(Version::DATAFED_RELEASE_MONTH);
  reply.set_release_day(Version::DATAFED_RELEASE_DAY);
  reply.set_release_hour(Version::DATAFED_RELEASE_HOUR);
  reply.set_release_minute(Version::DATAFED_RELEASE_MINUTE);

  reply.set_api_major(Version::DATAFED_COMMON_PROTOCOL_API_MAJOR);
  reply.set_api_minor(Version::DATAFED_COMMON_PROTOCOL_API_MINOR);
  reply.set_api_patch(Version::DATAFED_COMMON_PROTOCOL_API_PATCH);

  reply.set_component_major(SDMS::repository::version::MAJOR);
  reply.set_component_minor(SDMS::repository::version::MINOR);
  reply.set_component_patch(SDMS::repository::version::PATCH);

  PROC_MSG_END
}

std::unique_ptr<IMessage>
RequestWorker::procDataDeleteRequest(std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoDataDeleteRequest, Anon::AckReply)

  if (request->loc_size()) {

    for (int i = 0; i < request->loc_size(); i++) {
      std::string local_path = createSanitizedPath(request->loc(i).path());

      DL_DEBUG(message_log_context, "Delete "
                                        << request->loc_size()
                                        << " file(s), path: " << local_path);
      boost::filesystem::path data_path(local_path);
      boost::filesystem::remove(data_path);
    }
  }

  PROC_MSG_END
}

std::unique_ptr<IMessage>
RequestWorker::procDataGetSizeRequest(std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoDataGetSizeRequest, Auth::RepoDataSizeReply)

  DL_DEBUG(message_log_context, "Data get size.");

  RecordDataSize *data_sz;

  for (int i = 0; i < request->loc_size(); i++) {
    const RecordDataLocation &item = request->loc(i);

		std::string local_path = createSanitizedPath(item.path());
    
    boost::filesystem::path data_path(local_path);

    data_sz = reply.add_size();
    data_sz->set_id(item.id());

    if (boost::filesystem::exists(data_path)) {
      data_sz->set_size(boost::filesystem::file_size(data_path));
    } else {
      data_sz->set_size(0);
      DL_ERROR(message_log_context,
               "DataGetSizeReq - path does not exist: " << item.path());
      // This should through an error
    }
    DL_DEBUG(message_log_context,
             "FILE SIZE: " << data_sz->size() << ", path to collection: "
                           << m_config.globus_collection_path
                           << ", full path to file: " << local_path);
  }

  PROC_MSG_END
}

std::unique_ptr<IMessage>
RequestWorker::procPathCreateRequest(std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoPathCreateRequest, Anon::AckReply)

	std::string local_path = createSanitizedPath(request->path());

  boost::filesystem::path data_path(local_path);
  DL_DEBUG(message_log_context,
           "Creating Path if it does not exist, path to collection: "
               << m_config.globus_collection_path
               << ", full path to create: " << local_path);
  if (!boost::filesystem::exists(data_path)) {
    boost::filesystem::create_directory(data_path);
  }

  PROC_MSG_END
}

std::unique_ptr<IMessage>
RequestWorker::procPathDeleteRequest(std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoPathDeleteRequest, Anon::AckReply)

  DL_DEBUG(message_log_context,
           "Relative path delete request: " << request->path());

	std::string local_path = createSanitizedPath(request->path());

  boost::filesystem::path data_path(local_path);
  DL_TRACE(message_log_context,
           "Removing Path if it exists, path to collection: "
               << m_config.globus_collection_path
               << ", full path to remove: " << local_path);
  if (boost::filesystem::exists(data_path)) {
    boost::filesystem::remove_all(data_path);
  }

  PROC_MSG_END
}

} // namespace Repo
} // namespace SDMS
