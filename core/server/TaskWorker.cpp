
// Local private includes
#include "TaskWorker.hpp"
#include "Config.hpp"
#include "ITaskMgr.hpp"

// Common public includes
#include "common/CipherEngine.hpp"
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "DatabaseAPI.hpp"
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/IMessage.hpp"
#include "common/MessageFactory.hpp"
#include "common/SDMS.pb.h"
#include "common/SocketOptions.hpp"
#include "common/Util.hpp"

// Standard includes
#include "common/TraceException.hpp"
#include "unistd.h"
#include <memory>
#include <sstream>

using namespace std;
using namespace libjson;

// #define TASK_DELAY sleep(60);
#define TASK_DELAY

namespace SDMS {
namespace Core {

TaskWorker::TaskWorker(ITaskMgr &a_mgr, uint32_t a_worker_id,
                       LogContext log_context)
    : ITaskWorker(a_worker_id, log_context), m_mgr(a_mgr),
      m_db(Config::getInstance().db_url, Config::getInstance().db_user,
           Config::getInstance().db_pass, Config::getInstance().cred_dir) {

  log_context.thread_name += "-TaskWorker";
  log_context.thread_id = a_worker_id;
  m_thread = std::make_unique<std::thread>(&TaskWorker::workerThread, this,
                                           log_context);

  m_execute[TC_RAW_DATA_TRANSFER] = &cmdRawDataTransfer;
  m_execute[TC_RAW_DATA_DELETE] = &cmdRawDataDelete;
  m_execute[TC_RAW_DATA_UPDATE_SIZE] = &cmdRawDataUpdateSize;
  m_execute[TC_ALLOC_CREATE] = &cmdAllocCreate;
  m_execute[TC_ALLOC_DELETE] = &cmdAllocDelete;
}

TaskWorker::~TaskWorker() {
  m_running = false;
  if (m_thread.get() != nullptr) {
    m_thread->join();
  }
}

/**
 * @brief Thread method for TaskWorker task processing.
 *
 * Basic loop of getting a task from TaskMgr, processing, then reporting back to
 * TaskMgr. All steps of a task are processed unless a non-permanent failure
 * occurs. Task control objects (Task*) are released by the TaskMgr when either
 * retryTask or getNextTask are called.
 */
void TaskWorker::workerThread(LogContext log_context) {
  string err_msg;
  Value task_cmd;
  Value::ObjectIter iter;
  uint32_t cmd = 0;
  int step;
  bool first;
  int db_connection_backoff;

  while (m_running) {
    DL_DEBUG(log_context, "Grabbing next task");
    std::unique_ptr<ITaskMgr::Task> m_task = m_mgr.getNextTask(this);

    err_msg.clear();
    first = true;
    // This value is increased everytime a failed db connection happens and is
    // used to prevent the relevant logging from printing as fast as this while
    // loop can run
    db_connection_backoff = 1;

    while (true) {
      try {
        if (first) {
          m_db.taskRun(m_task->task_id, task_cmd, log_context, 0);
          first = false;
        } else {
          m_db.taskRun(m_task->task_id, task_cmd, log_context,
                       err_msg.size() ? 0 : &step,
                       err_msg.size() ? &err_msg : 0);
        }

        const Value::Object &obj = task_cmd.asObject();

        cmd = (uint32_t)obj.getNumber("cmd");

        const Value &params = obj.getValue("params");

        if (obj.has("step")) {
          step = obj.asNumber();
        } else if (cmd != TC_STOP) {
          EXCEPT(1, "Reply missing step value");
        }

        ICommunicator::Response response;
        if (m_execute.count(cmd)) {
          DL_DEBUG(log_context,
                   "TASK_ID: " << m_task->task_id << ", Step: " << step);
          response = m_execute[cmd](*this, params, log_context);

        } else if (cmd == TC_STOP) {
          DL_DEBUG(log_context, "TASK_ID: " << m_task->task_id
                                            << ", STOP at step: " << step);
          m_mgr.newTasks(params, log_context);
          break;
        } else {
          DL_ERROR(log_context, "Invalid task command: " << cmd);
          EXCEPT_PARAM(1, "Invalid task command: " << cmd);
        }

        if (response.error or response.time_out) {
          err_msg = response.error_msg;
          DL_DEBUG(log_context, "error dectected: "
                                    << response.error << " time_out detected: "
                                    << response.time_out << " cmd: " << cmd);
          DL_DEBUG(log_context, "err_msg: " << err_msg);
          if (m_mgr.retryTask(std::move(m_task), log_context)) {
            DL_DEBUG(log_context, "retry period exceeded");
            err_msg = "Maximum task retry period exceeded.";
            // We give up, exit inner while loop and delete task
            break;
          } else {
            DL_DEBUG(log_context, "Done with retries");
            // Done for now - TaskMgr owns task, so clear ptr to prevent
            // deletion, then exit inner while loop
            m_task = 0;
            break;
          }
        }

        // Set back to default since a db connection was successfully
        // established
        db_connection_backoff = 1;
      } catch (TraceException &e) {
        err_msg = e.toString();

        DL_ERROR(log_context, "Task worker "
                                  << id() << " exception: " << err_msg
                                  << " task_id is " << m_task->task_id
                                  << " cmd is " << cmd);

        // Detect, log, and backoff the db connection until it can successfully
        // be established
        if (err_msg.find("SDMS DB interface failed") != std::string::npos) {
          DL_INFO(log_context, "Task worker "
                                   << id() << " exception: " << err_msg
                                   << " backoff is set to "
                                   << db_connection_backoff << " task_id is "
                                   << m_task->task_id << " cmd is " << cmd);

          int sleep_time = db_connection_backoff;
          db_connection_backoff = min(db_connection_backoff * 2, 60);
          sleep(sleep_time);
        }

        if (err_msg.find("Task " + m_task->task_id + " does not exist") !=
            std::string::npos) {
          DL_ERROR(log_context, "Task is not found in the database something "
                                "strange is going on, move to the next task");
          break;
        }
      } catch (exception &e) {
        err_msg = e.what();
        DL_ERROR(log_context,
                 "Task worker " << id() << " exception: " << err_msg);
      }

      task_cmd.clear();

      if (not m_running) {
        DL_DEBUG(log_context,
                 "Graceful termination of TASK_ID: " << m_task->task_id);
        break;
      }
    } // End of inner while loop

  } // End of outer while loop
}


//Checks if the tokens are encrypted, if not then it returns the token, if it is encrypted it unencrypts it and returns the unencrypted token
std::string
TaskWorker::prepToken(const Value::Object &obj,std::string token, const std::string& cipher_key_path,bool needs_update, LogContext log_context)
{

    //if the token's encryption already exists
    if(!needs_update)
    {
        //TOKEN IS ENCRYPTED
        unsigned char token_key[SDMS::CipherEngine::KEY_LENGTH];
        readFile(cipher_key_path + "datafed-token-key.txt", SDMS::CipherEngine::KEY_LENGTH, token_key);
        CipherEngine cipher(token_key);

        CipherEngine::CipherString encoded_obj;

        //Prep Token into a char[]
        string token_str = obj.getString(token);  // assume known size
        encoded_obj.encrypted_msg = std::unique_ptr<char[]>(new char[token_str.size() + 1]);  // +1 for null terminator
        std::memcpy(encoded_obj.encrypted_msg.get(), token_str.c_str(), token_str.size() + 1);     // copy including '\0'

        encoded_obj.encrypted_msg_len = obj.getNumber(token+"_len");

        //Prep IV into a char[]
        string iv_str = obj.getString(token + "_iv");  // assume known size
        encoded_obj.iv = std::unique_ptr<char[]>(new char[iv_str.size() + 1]);  // +1 for null terminator
        std::memcpy(encoded_obj.iv.get(), iv_str.c_str(), iv_str.size() + 1);     // copy including '\0'

        //Decrypt it:
        return cipher.decrypt(encoded_obj, log_context);
    }
    else
    {
        DL_WARNING(log_context, "Token Isn't Encrypted, starting encryption and refresh process");

        return obj.getString(token);
    }
return obj.getString(token);
}

bool
TaskWorker::tokenNeedsUpdate(const Value::Object &obj)
{
    if(!obj.has("acc_tok_iv") || !obj.has("acc_tok_len") || !obj.has("ref_tok_iv") || !obj.has("ref_tok_len"))
    {
        return true;
    }

    return false;
}

std::string 
TaskWorker::enumToString(Token_Name token_name)
{
    return tokenNameToString[token_name];
}

std::map<TaskWorker::Token_Name, std::string> TaskWorker::tokenNameToString =
{
    { TaskWorker::Token_Name::ACCESS, "access_token" },
    { TaskWorker::Token_Name::REFRESH, "refresh_token" }
};

ICommunicator::Response
TaskWorker::cmdRawDataTransfer(TaskWorker &me, const Value &a_task_params,
                               LogContext log_context) {

  Token_Name access_token_name = Token_Name::ACCESS;
  Token_Name refresh_token_name = Token_Name::REFRESH;
  bool needs_update = false;
  const Value::Object &obj = a_task_params.asObject();

  //TokenPrepFuncs
  needs_update = tokenNeedsUpdate(obj);

  //Update the tokens to be unencrypted
  string acc_tok = prepToken(obj, enumToString(access_token_name), me.m_db.cipher_key_file_path, needs_update, log_context);
  string ref_tok = prepToken(obj, enumToString(refresh_token_name), me.m_db.cipher_key_file_path, needs_update, log_context);

  const string &uid = obj.getString("uid");
  TaskType type = (TaskType)obj.getNumber("type");
  Encryption encrypt = (Encryption)obj.getNumber("encrypt");
  const string &src_ep = obj.getString("src_repo_ep");
  const string &src_path = obj.getString("src_repo_path");
  const string &dst_ep = obj.getString("dst_repo_ep");
  const string &dst_path = obj.getString("dst_repo_path");
  const Value::Array &files = obj.getArray("files");
  bool encrypted = true;
  GlobusAPI::EndpointInfo ep_info;

  uint32_t expires_in = obj.getNumber("access_exp_in");
  uint32_t token_type =
      obj.getNumber("token_type"); // TODO: use enum if possible
  string collection_id;
  string scopes;
  if (token_type == AccessTokenType::GLOBUS_TRANSFER) {
    // fields must be present on transfer tokens
    scopes = obj.getString("scopes");
    collection_id = obj.getString("collection_id");
  }

  DL_TRACE(log_context, ">>>> Token Expires in: " << expires_in);

  //if the token expired or needs to be updated
  if ((expires_in < 3600) or needs_update) {
    me.m_db.setClient(uid);

    if (token_type ==
        AccessTokenType::GLOBUS_DEFAULT) { // TODO: this work is mostly
                                           // duplicated from ClientWorker
      DL_DEBUG(log_context, "Refreshing access token for "
                                << uid << " (expires in " << expires_in << ")");

      me.m_glob.refreshAccessToken(ref_tok, acc_tok, expires_in);
      me.m_db.userSetAccessToken(acc_tok, expires_in, ref_tok, log_context);
    } else {
      try {
        me.m_glob.refreshAccessToken(ref_tok, acc_tok, expires_in);
        me.m_db.userSetAccessToken(acc_tok, expires_in, ref_tok,
                                   (AccessTokenType)token_type,
                                   collection_id + "|" + scopes, log_context);
      } catch (TraceException &e) {
        DL_ERROR(log_context,
                 "Failure when refreshing Globus Mapped collection token for "
                     << uid << " on collection " << collection_id);
        throw e;
      }
    }
  }

  if (type == TT_DATA_GET || type == TT_DATA_PUT) {
    const string &ep = (type == TT_DATA_GET) ? dst_ep : src_ep;

    // Check destination endpoint
    me.m_glob.getEndpointInfo(ep, acc_tok, ep_info);
    if (!ep_info.activated)
      EXCEPT_PARAM(1, "Globus endpoint " << ep << " requires activation.");

    // TODO Notify if ep activation expiring soon

    // Calculate encryption state based on non-datafed endpoint
    encrypted = me.checkEncryption(ep_info, encrypt);

    // If data is external, also check the other endpoint for encryption state
    if (type == TT_DATA_GET && obj.getValue("src_repo_id").isNumber()) {
      GlobusAPI::EndpointInfo ep_info2;

      me.m_glob.getEndpointInfo(src_ep, acc_tok, ep_info2);
      if (!ep_info.activated) {
        DL_ERROR(log_context,
                 "Globus endpoint " << ep << " requires activation.");
        EXCEPT_PARAM(1, "Globus endpoint " << ep << " requires activation.");
      }

      encrypted = me.checkEncryption(ep_info, ep_info2, encrypt);
    }
  }

  // Init Globus transfer
  DL_TRACE(log_context, "Init globus transfer");

  vector<pair<string, string>> files_v;
  for (Value::ArrayConstIter f = files.begin(); f != files.end(); f++) {
    const Value::Object &fobj = f->asObject();
    if (type == TT_DATA_PUT || fobj.getNumber("size") > 0)
      files_v.push_back(make_pair(src_path + fobj.getString("from"),
                                  dst_path + fobj.getString("to")));
  }

  if (files_v.size()) {
    DL_TRACE(log_context, "Begin transfer of " << files_v.size() << " files");
    string glob_task_id =
        me.m_glob.transfer(src_ep, dst_ep, files_v, encrypted, acc_tok);
    // Monitor Globus transfer

    GlobusAPI::XfrStatus xfr_status;
    string err_msg;

    do {
      sleep(5);

      if (me.m_glob.checkTransferStatus(glob_task_id, acc_tok, xfr_status,
                                        err_msg)) {
        // Transfer task needs to be cancelled
        DL_DEBUG(log_context, "Cancelling task: " << glob_task_id);
        me.m_glob.cancelTask(glob_task_id, acc_tok);
      }
    } while (xfr_status < GlobusAPI::XS_SUCCEEDED);

    if (xfr_status == GlobusAPI::XS_FAILED) {
      EXCEPT(1, err_msg);
    }
  } else {
    DL_DEBUG(log_context, "No files to transfer");
  }

  ICommunicator::Response response;
  response.time_out = false;
  return response;
}

ICommunicator::Response TaskWorker::cmdRawDataDelete(TaskWorker &me,
                                                     const Value &a_task_params,
                                                     LogContext log_context) {

  const Value::Object &obj = a_task_params.asObject();

  const string &repo_id = obj.getString("repo_id");
  const string &path = obj.getString("repo_path");
  const Value::Array &ids = obj.getArray("ids");
  Value::ArrayConstIter id = ids.begin();
  size_t i = 0, j, sz = ids.size();
  size_t chunk = Config::getInstance().repo_chunk_size;

  // Issue #603 - break large requests into chunks to reduce likelihood of
  // timeouts
  MessageFactory msg_factory;
  ICommunicator::Response resp;

  while (i < sz) {
    j = min(i + chunk, sz);

    auto message_req = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

    auto del_req =
        std::make_unique<Auth::RepoDataDeleteRequest>(); //     del_req;
    for (; i < j; i++, id++) {
      RecordDataLocation *loc = del_req->add_loc();
      loc->set_id(id->asString());
      loc->set_path(path + id->asString().substr(2));
    }
    message_req->setPayload(std::move(del_req));
    log_context.correlation_id = std::get<std::string>(
        message_req->get(MessageAttribute::CORRELATION_ID));
    DL_DEBUG(log_context, "Creating Repo Data Delete Request");
    resp = me.repoSendRecv(repo_id, std::move(message_req), log_context);
    if (resp.error or resp.time_out) {
      return resp;
    }
  }
  return resp;
}

ICommunicator::Response
TaskWorker::cmdRawDataUpdateSize(TaskWorker &me, const Value &a_task_params,
                                 LogContext log_context) {

  const Value::Object &obj = a_task_params.asObject();

  const string &repo_id = obj.getString("repo_id");
  const string &path = obj.getString("repo_path");
  const Value::Array &ids = obj.getArray("ids");
  auto size_req = std::make_unique<Auth::RepoDataGetSizeRequest>(); //   sz_req;
  // RecordDataLocation *            loc;

  MessageFactory msg_factory;
  auto message_req = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

  for (Value::ArrayConstIter id = ids.begin(); id != ids.end(); id++) {
    RecordDataLocation *loc = size_req->add_loc();
    loc->set_id(id->asString());
    loc->set_path(path + id->asString().substr(2));
  }

  message_req->setPayload(std::move(size_req));
  log_context.correlation_id =
      std::get<std::string>(message_req->get(MessageAttribute::CORRELATION_ID));
  DL_DEBUG(log_context, "Sending message size request");
  ICommunicator::Response response =
      me.repoSendRecv(repo_id, std::move(message_req), log_context);

  if (response.time_out == true) {
    return response;
  } else if (response.error == false) {
    if (not response.message) {
      DL_ERROR(log_context,
               "No timeout or error was reported but no message was defined.");
    }
    auto proto_msg =
        std::get<google::protobuf::Message *>(response.message->getPayload());
    auto size_reply = dynamic_cast<Auth::RepoDataSizeReply *>(proto_msg);
    if (size_reply != 0) {
      if (size_reply->size_size() != (int)ids.size()) {
        DL_ERROR(log_context,
                 "Mismatched result size with RepoDataSizeReply from repo: "
                     << repo_id);
        EXCEPT_PARAM(1,
                     "Mismatched result size with RepoDataSizeReply from repo: "
                         << repo_id);
      }

      me.m_db.recordUpdateSize(*size_reply, log_context);
    } else {
      DL_ERROR(log_context,
               "Unexpected reply to RepoDataSizeReply from repo: " << repo_id);
      EXCEPT_PARAM(
          1, "Unexpected reply to RepoDataSizeReply from repo: " << repo_id);
    }
  }

  return response;
}

ICommunicator::Response TaskWorker::cmdAllocCreate(TaskWorker &me,
                                                   const Value &a_task_params,
                                                   LogContext log_context) {
  const Value::Object &obj = a_task_params.asObject();

  const string &repo_id = obj.getString("repo_id");
  const string &path = obj.getString("repo_path");

  MessageFactory msg_factory;
  auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

  auto req = std::make_unique<Auth::RepoPathCreateRequest>();
  req->set_path(path);
  message->setPayload(std::move(req));

  log_context.correlation_id =
      std::get<std::string>(message->get(MessageAttribute::CORRELATION_ID));
  DL_DEBUG(log_context, "Sending message allocation create request");
  return me.repoSendRecv(repo_id, std::move(message), log_context);
}

ICommunicator::Response TaskWorker::cmdAllocDelete(TaskWorker &me,
                                                   const Value &a_task_params,
                                                   LogContext log_context) {

  const Value::Object &obj = a_task_params.asObject();

  const string &repo_id = obj.getString("repo_id");
  const string &path = obj.getString("repo_path");

  MessageFactory msg_factory;
  auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

  auto req = std::make_unique<Auth::RepoPathDeleteRequest>();
  req->set_path(path);
  message->setPayload(std::move(req));
  log_context.correlation_id =
      std::get<std::string>(message->get(MessageAttribute::CORRELATION_ID));
  DL_DEBUG(log_context, "Sending message repo path delete request");

  return me.repoSendRecv(repo_id, std::move(message), log_context);
}

bool TaskWorker::checkEncryption(const GlobusAPI::EndpointInfo &a_ep_info,
                                 Encryption a_encrypt) {
  switch (a_encrypt) {
  case ENCRYPT_NONE:
    if (a_ep_info.force_encryption)
      EXCEPT_PARAM(1, "Endpoint " << a_ep_info.id << " requires encryption.");
    return false;
  case ENCRYPT_AVAIL:
    if (a_ep_info.supports_encryption)
      return true;
    else
      return false;
  case ENCRYPT_FORCE:
    if (!a_ep_info.supports_encryption)
      EXCEPT_PARAM(1, "Endpoint " << a_ep_info.id
                                  << " does not support encryption.");
    return true;
  default:
    EXCEPT_PARAM(1, "Invalid transfer encryption value: " << a_encrypt);
  }

  // compiler warns, but can't get here
  return false;
}

bool TaskWorker::checkEncryption(const GlobusAPI::EndpointInfo &a_ep_info1,
                                 const GlobusAPI::EndpointInfo &a_ep_info2,
                                 Encryption a_encrypt) {
  switch (a_encrypt) {
  case ENCRYPT_NONE:
    if (a_ep_info1.force_encryption && a_ep_info1.force_encryption)
      EXCEPT_PARAM(1, "Endpoints " << a_ep_info1.id << " and " << a_ep_info2.id
                                   << " require encryption.");
    else if (a_ep_info1.force_encryption)
      EXCEPT_PARAM(1, "Endpoint " << a_ep_info1.id << " requires encryption.");
    else if (a_ep_info2.force_encryption)
      EXCEPT_PARAM(1, "Endpoint " << a_ep_info2.id << " requires encryption.");
    return false;
  case ENCRYPT_AVAIL:
    if (a_ep_info1.supports_encryption && a_ep_info2.supports_encryption)
      return true;
    else
      return false;
  case ENCRYPT_FORCE:
    if (!a_ep_info1.supports_encryption && !a_ep_info1.supports_encryption)
      EXCEPT_PARAM(1, "Endpoints " << a_ep_info1.id << " and " << a_ep_info1.id
                                   << " do not support encryption.");
    else if (!a_ep_info1.supports_encryption)
      EXCEPT_PARAM(1, "Endpoint " << a_ep_info1.id
                                  << " does not support encryption.");
    else if (!a_ep_info2.supports_encryption)
      EXCEPT_PARAM(1, "Endpoint " << a_ep_info2.id
                                  << " does not support encryption.");
    return true;
  default:
    EXCEPT_PARAM(1, "Invalid transfer encryption value: " << a_encrypt);
  }

  // compiler warns, but can't get here
  return false;
}

ICommunicator::Response
TaskWorker::repoSendRecv(const string &a_repo_id,
                         std::unique_ptr<IMessage> &&a_msg,
                         LogContext log_context) {

  log_context.correlation_id =
      std::get<std::string>(a_msg->get(MessageAttribute::CORRELATION_ID));
  Config &config = Config::getInstance();

  std::string registered_repos = "";

  std::map<std::string, RepoData> repos;
  if (config.repoCacheInvalid()) {
    DL_TRACE(log_context, "config repo cache is detected to be invalid.");
    // Task worker is not in charge of updating the cache that is handled by
    // another thread so we will simply make a separate call and continue
    // working
    std::vector<RepoData> temp_repos;
    m_db.repoList(temp_repos, log_context);
    m_db.repoView(temp_repos, log_context);

    for (RepoData &r : temp_repos) {
      repos[r.id()] = r;
      DL_TRACE(log_context,
               "Refreshed cache with repos: " << r.id() << " " << r.address());
    }
  } else {
    repos = config.getRepos();
  }

  if (!repos.count(a_repo_id)) {
    for (auto &repo : repos) {
      registered_repos = repo.second.id() + " ";
    }
    EXCEPT_PARAM(1, "Task refers to non-existent repo server: "
                        << a_repo_id
                        << " Registered repos are: " << registered_repos);
  }
  // Need to be able to split repos into host and scheme and port
  const std::string client_id = [&]() {
    std::stringstream ss;
    ss << "task_worker-";
    ss << id();
    std::string str;
    ss >> str;
    return str;
  }();

  try {

    auto client =
        [&](const std::string &repo_address, const std::string &repo_pub_key,
            const std::string &socket_id, LogContext log_context) {
          AddressSplitter splitter(repo_address);

          /// Creating input parameters for constructing Communication Instance
          SocketOptions socket_options;
          socket_options.scheme = splitter.scheme();
          socket_options.scheme = URIScheme::TCP;
          socket_options.class_type = SocketClassType::CLIENT;
          socket_options.direction_type =
              SocketDirectionalityType::BIDIRECTIONAL;
          socket_options.communication_type =
              SocketCommunicationType::ASYNCHRONOUS;
          socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
          socket_options.connection_security = SocketConnectionSecurity::SECURE;
          socket_options.protocol_type = ProtocolType::ZQTP;
          socket_options.host = splitter.host();
          socket_options.port = splitter.port();
          socket_options.local_id = socket_id;

          CredentialFactory cred_factory;

          std::unordered_map<CredentialType, std::string> cred_options;
          cred_options[CredentialType::PUBLIC_KEY] =
              config.sec_ctx->get(CredentialType::PUBLIC_KEY);
          cred_options[CredentialType::PRIVATE_KEY] =
              config.sec_ctx->get(CredentialType::PRIVATE_KEY);
          // Cannot grab the public key from sec_ctx because we have several
          // repos to pick from
          // cred_options[CredentialType::SERVER_KEY] =
          // config.sec_ctx->get(CredentialType::SERVER_KEY);
          cred_options[CredentialType::SERVER_KEY] = repo_pub_key;

          DL_TRACE(log_context,
                   "Core server client to repo server public key "
                       << cred_options[CredentialType::PUBLIC_KEY]);
          DL_TRACE(log_context,
                   "Core server client to repo server private key "
                       << cred_options[CredentialType::PRIVATE_KEY]);
          DL_TRACE(log_context,
                   "Core server client to repo server Repo public key "
                       << cred_options[CredentialType::SERVER_KEY]);
          auto credentials =
              cred_factory.create(ProtocolType::ZQTP, cred_options);

          uint32_t timeout_on_receive = Config::getInstance().repo_timeout;
          long timeout_on_poll = Config::getInstance().repo_timeout;

          // When creating a communication channel with a server application we
          // need to locally have a client socket. So though we have specified a
          // client socket we will actually be communicating with the server.
          CommunicatorFactory communicator_factory(log_context);
          return communicator_factory.create(socket_options, *credentials,
                                             timeout_on_receive,
                                             timeout_on_poll);
        }(repos.at(a_repo_id).address(), repos.at(a_repo_id).pub_key(),
          client_id, log_context); // Pass the address into the lambda

    client->send(*a_msg);

    ICommunicator::Response response =
        client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    if (response.time_out) {
      DL_ERROR(log_context, "Timeout waiting for response from "
                                << a_repo_id << " address "
                                << client->address());
      return response;
    } else if (response.error) {
      DL_ERROR(log_context, "Error while waiting for response from "
                                << a_repo_id << " " << response.error_msg);
      return response;
    }

    auto proto_msg =
        std::get<google::protobuf::Message *>(response.message->getPayload());
    auto nack = dynamic_cast<Anon::NackReply *>(proto_msg);
    if (nack != 0) {
      ErrorCode code = nack->err_code();
      string msg =
          nack->has_err_msg() ? nack->err_msg() : "Unknown service error";
      EXCEPT(code, msg);
    }

    return response;

  } catch (TraceException &e) {

    DL_ERROR(log_context,
             "Caught exception in repo communication logic: " << e.what());
    EXCEPT_PARAM(1, "Error detected in TaskWorker " << e.what());
  }
}

} // namespace Core
} // namespace SDMS
