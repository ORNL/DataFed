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

RequestWorker::RequestWorker(size_t a_tid)
    : m_config(Config::getInstance()),
      m_tid(a_tid),
      m_worker_thread(0),
      m_run(true) {
  m_msg_mapper = std::unique_ptr<IMessageMapper>(new ProtoBufMap);
  setupMsgHandlers();
  std::cout << __LINE__ << " creating workerThread " << std::endl;
  m_worker_thread = new thread(&RequestWorker::workerThread, this);
}

RequestWorker::~RequestWorker() {
  stop();
  wait();
}

void RequestWorker::stop() { m_run = false; }

void RequestWorker::wait() {
  if (m_worker_thread) {
    m_worker_thread->join();
    delete m_worker_thread;
    m_worker_thread = 0;
  }
}

//#define SET_MSG_HANDLER(proto_id,msg,func)
// m_msg_handlers[MsgBuf::findMessageType( proto_id, #msg )] = funcl
#define SET_MSG_HANDLER(proto_id, msg, func) \
  m_msg_handlers[m_msg_mapper->getMessageType(proto_id, #msg)] = func

void RequestWorker::setupMsgHandlers() {
  static std::atomic_flag lock = ATOMIC_FLAG_INIT;

  if (lock.test_and_set()) return;

  try {

    uint8_t proto_id =
        m_msg_mapper->getProtocolID(MessageProtocol::GOOGLE_ANONONYMOUS);
    // uint8_t proto_id = REG_PROTO( SDMS::Anon );

    SET_MSG_HANDLER(proto_id, VersionRequest,
                    &RequestWorker::procVersionRequest);

    // proto_id = REG_PROTO( SDMS::Auth );
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
    DL_ERROR("RequestWorker::setupMsgHandlers, exception: " << e.toString());
    throw;
  }
}

void RequestWorker::workerThread() {
  DL_DEBUG("W" << m_tid << " thread started");

  // MsgComm     comm( "inproc://workers", MsgComm::DEALER, false );
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
    // socket_options.port = 1341;
    socket_options.local_id = socket_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    CommunicatorFactory factory;
    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }(repo_thread_id);

  // uint16_t    msg_type;
  //   handler;

  std::cout << "Worker thread W" << m_tid << " Listening on address "
            << client->address() << std::endl;

  int count = 0;

  while (m_run) {
    try {
      ICommunicator::Response response =
          client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
      ++count;
      if (count > 1000) {
        count = 0;
        std::cout << "Client attempting to receive message on "
                  << client->address() << " client id is " << client->id()
                  << std::endl;
      }
      if (response.time_out == false and response.error == false) {
        // if ( comm.recv( m_msg_buf, true, 1000 ))
        // {
        IMessage &message = *response.message;
        uint16_t msg_type = std::get<uint16_t>(
            message.get(constants::message::google::MSG_TYPE));
        // uint16_t msg_type = m_msg_buf.getMsgType();

#if 0
                // DEBUG - Inject random delay in message processing
                if ( m_tid & 1 )
                {
                    //int delay = (rand() % 2000)*1000;
                    //usleep( delay );
                    DL_DEBUG( "W" << m_tid << " sleeping" );
                    sleep( 30 );
                }
#endif

        DL_TRACE("W" << m_tid << " recvd msg type: " << msg_type);

        if (m_msg_handlers.count(msg_type)) {
          // handler = m_msg_handlers.find( msg_type );
          map<uint16_t, msg_fun_t>::iterator handler =
              m_msg_handlers.find(msg_type);
          DL_TRACE("W" << m_tid << " calling handler");

          auto send_message =
              (this->*handler->second)(std::move(response.message));

          std::cout << "Sending message from repo server" << std::endl;
          client->send(*(send_message));
          // comm.send( m_msg_buf );

          DL_TRACE("W" << m_tid << " reply sent.");
        } else {
          DL_ERROR("W" << m_tid
                       << " recvd unregistered msg type: " << msg_type);
        }
      } else if (response.error) {
        std::cout << "Error detected " << response.error_msg << std::endl;
      }
    } catch (TraceException &e) {
      DL_ERROR("W" << m_tid << " " << e.toString());
    } catch (exception &e) {
      DL_ERROR("W" << m_tid << " " << e.what());
    } catch (...) {
      DL_ERROR("W" << m_tid << " unknown exception type");
    }
  }

  DL_DEBUG("W" << m_tid << " thread exiting");
}

#define PROC_MSG_BEGIN(msgclass, replyclass)                              \
  msgclass *request = 0;                                                  \
  std::cout << __LINE__ << " PROC_MSG_BEGIN" << std::endl;                \
  ::google::protobuf::Message *base_msg =                                 \
      std::get<google::protobuf::Message *>(msg_request->getPayload());   \
  if (base_msg) {                                                         \
    std::cout << __LINE__ << " PROC_MSG_BEGIN" << std::endl;              \
    request = dynamic_cast<msgclass *>(base_msg);                         \
    if (request) {                                                        \
      std::cout << __LINE__ << " PROC_MSG_BEGIN" << std::endl;            \
      DL_TRACE("Rcvd [" << request->DebugString() << "]");                \
      std::unique_ptr<google::protobuf::Message> reply_ptr =              \
          std::make_unique<replyclass>();                                 \
      replyclass &reply = *(dynamic_cast<replyclass *>(reply_ptr.get())); \
      std::cout << __LINE__ << " PROC_MSG_BEGIN" << std::endl;            \
      try {

#define PROC_MSG_END                                                         \
  auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);       \
  msg_reply->setPayload(std::move(reply_ptr));                               \
  return msg_reply;                                                          \
  }                                                                          \
  catch (TraceException & e) {                                               \
    DL_ERROR("W" << m_tid << " " << e.toString());                           \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);     \
    auto nack = std::make_unique<NackReply>();                               \
    nack->set_err_code((ErrorCode)e.getErrorCode());                         \
    nack->set_err_msg(e.toString(true));                                     \
    msg_reply->setPayload(std::move(nack));                                  \
    return msg_reply;                                                        \
  }                                                                          \
  catch (exception & e) {                                                    \
    DL_ERROR("W" << m_tid << " " << e.what());                               \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);     \
    auto nack = std::make_unique<NackReply>();                               \
    nack->set_err_code(ID_INTERNAL_ERROR);                                   \
    nack->set_err_msg(e.what());                                             \
    msg_reply->setPayload(std::move(nack));                                  \
    return msg_reply;                                                        \
  }                                                                          \
  catch (...) {                                                              \
    DL_ERROR("W" << m_tid << " unkown exception while processing message!"); \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);     \
    auto nack = std::make_unique<NackReply>();                               \
    nack->set_err_code(ID_INTERNAL_ERROR);                                   \
    nack->set_err_msg("Unknown exception type");                             \
    msg_reply->setPayload(std::move(nack));                                  \
    return msg_reply;                                                        \
  }                                                                          \
  DL_TRACE("Sent: " << reply.DebugString());                                 \
  }                                                                          \
  else {                                                                     \
    DL_ERROR("W" << m_tid << ": dynamic cast of msg buffer failed!");        \
  }                                                                          \
  }                                                                          \
  else {                                                                     \
    DL_ERROR(                                                                \
        "W"                                                                  \
        << m_tid                                                             \
        << ": message parse failed (malformed or unregistered msg type).");  \
    auto msg_reply = m_msg_factory.createResponseEnvelope(*msg_request);     \
    auto nack = std::make_unique<NackReply>();                               \
    nack->set_err_code(ID_BAD_REQUEST);                                      \
    nack->set_err_msg(                                                       \
        "Message parse failed (malformed or unregistered msg type)");        \
    msg_reply->setPayload(std::move(nack));                                  \
    return msg_reply;                                                        \
  }                                                                          \
  return std::unique_ptr<IMessage>();

//#define PROC_MSG_BEGIN( msgclass, replyclass ) \
//msgclass *request = 0; \
//::google::protobuf::Message *base_msg = m_msg_buf.unserialize(); \
//if ( base_msg ) \
//{ \
//    request = dynamic_cast<msgclass*>( base_msg ); \
//    if ( request ) \
//    { \
//        DL_TRACE( "Rcvd [" << request->DebugString() << "]"); \
//        replyclass reply; \
//        try \
//        {
//
// #define PROC_MSG_END \
//            m_msg_buf.serialize( reply ); \
//        } \
//        catch( TraceException &e ) \
//        { \
//            DL_ERROR( "W"<<m_tid<<" " << e.toString() ); \
//            NackReply nack; \
//            nack.set_err_code( (ErrorCode) e.getErrorCode() ); \
//            nack.set_err_msg( e.toString( true ) ); \
//            m_msg_buf.serialize( nack );\
//        } \
//        catch( exception &e ) \
//        { \
//            DL_ERROR( "W"<<m_tid<<" " << e.what() ); \
//            NackReply nack; \
//            nack.set_err_code( ID_INTERNAL_ERROR ); \
//            nack.set_err_msg( e.what() ); \
//            m_msg_buf.serialize( nack ); \
//        } \
//        catch(...) \
//        { \
//            DL_ERROR( "W"<<m_tid<<" unkown exception while processing
//             message!" ); \
//            NackReply nack; \
//            nack.set_err_code( ID_INTERNAL_ERROR ); \
//            nack.set_err_msg( "Unknown exception type" ); \
//            m_msg_buf.serialize( nack ); \
//        } \
//        DL_TRACE( "Sent: " << reply.DebugString()); \
//    } \
//    else { \
//        DL_ERROR( "W"<<m_tid<<": dynamic cast of msg buffer failed!" );\
//    } \
//    delete base_msg; \
//} \
//else { \
//    DL_ERROR( "W"<<m_tid<<": buffer parse failed due to unregistered msg
//    type." ); \
//}
//

std::unique_ptr<IMessage> RequestWorker::procVersionRequest(
    std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(VersionRequest, VersionReply)

  DL_DEBUG("Version request");

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
  // reply.set_core( VER_CORE );
  // reply.set_repo( VER_REPO );
  // reply.set_web( VER_WEB );
  // reply.set_client_py( VER_CLIENT_PY );

  PROC_MSG_END
}

std::unique_ptr<IMessage> RequestWorker::procDataDeleteRequest(
    std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoDataDeleteRequest, Anon::AckReply)

  if (request->loc_size()) {

    for (int i = 0; i < request->loc_size(); i++) {
      string local_path = request->loc(i).path();
      DL_DEBUG("Delete " << request->loc_size()
                         << " file(s), path: " << local_path);
      boost::filesystem::path data_path(local_path);
      boost::filesystem::remove(data_path);
    }
  }

  PROC_MSG_END
}

std::unique_ptr<IMessage> RequestWorker::procDataGetSizeRequest(
    std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoDataGetSizeRequest, Auth::RepoDataSizeReply)

  DL_DEBUG("Data get size");

  RecordDataSize *data_sz;

  for (int i = 0; i < request->loc_size(); i++) {
    const RecordDataLocation &item = request->loc(i);

    string sanitized_request_path = item.path();
    while (!sanitized_request_path.empty()) {
      if (sanitized_request_path.back() == '/') {
        sanitized_request_path.pop_back();
      } else {
        break;
      }
    }

    string local_path = m_config.globus_collection_path;
    if (sanitized_request_path.front() != '/') {
      local_path += "/" + sanitized_request_path;
    } else {
      local_path += sanitized_request_path;
    }
    boost::filesystem::path data_path(local_path);

    data_sz = reply.add_size();
    data_sz->set_id(item.id());

    if (boost::filesystem::exists(data_path)) {
      data_sz->set_size(boost::filesystem::file_size(data_path));
    } else {
      data_sz->set_size(0);
      DL_ERROR("DataGetSizeReq - path does not exist: " << item.path());
    }
    DL_INFO("FILE SIZE: " << data_sz->size() << ", path to collection: "
                          << m_config.globus_collection_path
                          << ", full path to file: " << local_path);
  }

  PROC_MSG_END
}

std::unique_ptr<IMessage> RequestWorker::procPathCreateRequest(
    std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoPathCreateRequest, Anon::AckReply)

  std::cout << __LINE__ << " Calling procPathCreateRequest" << std::endl;
  string sanitized_request_path = request->path();
  while (!sanitized_request_path.empty()) {
    if (sanitized_request_path.back() == '/') {
      sanitized_request_path.pop_back();
    } else {
      break;
    }
  }
  std::cout << __LINE__ << std::endl;
  string local_path = m_config.globus_collection_path;
  if (sanitized_request_path.front() != '/') {
    local_path += "/" + sanitized_request_path;
  } else {
    local_path += sanitized_request_path;
  }

  boost::filesystem::path data_path(local_path);
  DL_INFO("Creating Path if it does not exist, path to collection: "
          << m_config.globus_collection_path
          << ", full path to create: " << local_path);
  if (!boost::filesystem::exists(data_path)) {
    boost::filesystem::create_directory(data_path);
  }
  std::cout << __LINE__ << std::endl;

  PROC_MSG_END
}

std::unique_ptr<IMessage> RequestWorker::procPathDeleteRequest(
    std::unique_ptr<IMessage> &&msg_request) {
  PROC_MSG_BEGIN(Auth::RepoPathDeleteRequest, Anon::AckReply)

  DL_DEBUG("Relative path delete request " << request->path());

  string sanitized_request_path = request->path();
  while (!sanitized_request_path.empty()) {
    if (sanitized_request_path.back() == '/') {
      sanitized_request_path.pop_back();
    } else {
      break;
    }
  }

  string local_path = m_config.globus_collection_path;
  if (sanitized_request_path.front() != '/') {
    local_path += "/" + sanitized_request_path;
  } else {
    local_path += sanitized_request_path;
  }

  boost::filesystem::path data_path(local_path);
  DL_INFO("Removing Path if it exists, path to collection: "
          << m_config.globus_collection_path
          << ", full path to remove: " << local_path);
  if (boost::filesystem::exists(data_path)) {
    boost::filesystem::remove_all(data_path);
  }

  PROC_MSG_END
}

}  // namespace Repo
}  // namespace SDMS
