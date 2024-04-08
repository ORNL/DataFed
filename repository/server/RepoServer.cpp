// Local private includes
#include "RepoServer.hpp"
#include "Version.hpp"

// Common public includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/IServer.hpp"
#include "common/KeyGenerator.hpp"
#include "common/MessageFactory.hpp"
#include "common/OperatorFactory.hpp"
#include "common/ServerFactory.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// Proto includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/Version.pb.h"

// Standard includes
#include <any>
#include <fstream>
#include <random>
#include <time.h>

#define timerDef() struct timespec _T0 = {0, 0}, _T1 = {0, 0}
#define timerStart() clock_gettime(CLOCK_REALTIME, &_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME, &_T1)
#define timerElapsed()                                                         \
  ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec) / 1.0e9))

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace {
std::string randomAlphaNumericCode() {
  std::string chars =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  std::mt19937 generator(time(nullptr));
  std::uniform_int_distribution<> distribution(0, chars.size() - 1);

  int length = 6; // set the desired length of the random string
  std::string random_string;
  for (int i = 0; i < length; ++i) {
    random_string += chars[distribution(generator)];
  }
  return random_string;
}
} // namespace

namespace SDMS {
namespace Repo {

Server::Server(LogContext log_context)
    : m_config(Config::getInstance()), m_log_context(log_context) {
  // Load keys from credential directory
  loadKeys();

  // Setup ZMQ security context
  std::unordered_map<CredentialType, std::string> keys;
  keys[CredentialType::PUBLIC_KEY] = m_pub_key;
  keys[CredentialType::PRIVATE_KEY] = m_priv_key;
  keys[CredentialType::SERVER_KEY] = m_core_key;

  CredentialFactory cred_factory;
  m_config.sec_ctx = cred_factory.create(ProtocolType::ZQTP, keys);
}

Server::~Server() {}

void Server::run() {
  checkServerVersion();

  DL_INFO(m_log_context,
          "Public/private MAPI starting on port " << m_config.port)

  // Create worker threads
  for (uint16_t t = 0; t < m_config.num_req_worker_threads; ++t) {
    DL_INFO(m_log_context, "Creating worker "
                               << t + 1 << " out of "
                               << m_config.num_req_worker_threads);
    m_req_workers.push_back(new RequestWorker(t + 1, m_log_context));
  }

  // Create secure interface and run message pump
  // NOTE: Normally ioSecure will not return
  ioSecure();

  // Clean-up workers
  vector<RequestWorker *>::iterator iwrk;

  for (iwrk = m_req_workers.begin(); iwrk != m_req_workers.end(); ++iwrk)
    (*iwrk)->stop();

  for (iwrk = m_req_workers.begin(); iwrk != m_req_workers.end(); ++iwrk)
    delete *iwrk;
}

void Server::checkServerVersion() {
  DL_INFO(m_log_context, "Checking core server connection and version at " << m_config.core_server);

  // Generate random security keys for anon version request to core server
  KeyGenerator generator;
  auto local_keys =
      generator.generate(ProtocolType::ZQTP, KeyType::PUBLIC_PRIVATE);
  local_keys[CredentialType::SERVER_KEY] = m_core_key;

  CredentialFactory cred_factory;
  auto local_sec_ctx = cred_factory.create(ProtocolType::ZQTP, local_keys);

  std::string repo_thread_id =
      "repo_main_socket_client-" + randomAlphaNumericCode();
  auto client = [&](const std::string &socket_id, const std::string &address,
                    ICredentials &credentials) {
    /// Creating input parameters for constructing Communication Instance
    AddressSplitter splitter(address);
    SocketOptions socket_options;
    socket_options.scheme = splitter.scheme();
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP;
    socket_options.connection_security = SocketConnectionSecurity::SECURE;
    socket_options.host = splitter.host();
    socket_options.port = splitter.port();
    // socket_options.port = 1341;
    socket_options.local_id = socket_id;

    // auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 20000;
    long timeout_on_poll = 20000;

    CommunicatorFactory factory(m_log_context);
    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(socket_options, credentials, timeout_on_receive,
                          timeout_on_poll);
  }(repo_thread_id, m_config.core_server, *local_sec_ctx);

  MessageFactory msg_factory;

  size_t attempt = 0;
  while (true) {
    ++attempt;
    DL_INFO(m_log_context, "Attempt " << attempt << " to initialize communication "
        << " with core server at " << m_config.core_server);
    auto msg = std::make_unique<VersionRequest>();
    auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    message->setPayload(std::move(msg));
    message->set(MessageAttribute::KEY,
                 local_sec_ctx->get(CredentialType::PUBLIC_KEY));

    LogContext msg_log_context = m_log_context;
    msg_log_context.correlation_id =
        std::get<std::string>(message->get(MessageAttribute::CORRELATION_ID));
    client->send(*message);

    auto response = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

    if (response.time_out) {
      DL_ERROR(msg_log_context,
               "Timeout waiting for response from core server: "
                   << m_config.core_server);
    } else if(response.error) {
      DL_ERROR(msg_log_context,
               "Error encountered waiting for core server: "
                   << m_config.core_server << " msg " << response.error_msg);
    } else {
    
      msg_log_context.correlation_id = std::get<std::string>(
        response.message->get(MessageAttribute::CORRELATION_ID));
      auto payload =
          std::get<google::protobuf::Message *>(response.message->getPayload());
      VersionReply *ver_reply = dynamic_cast<VersionReply *>(payload);
      if (ver_reply == 0) {
        EXCEPT_PARAM(
            1, "Invalid response from core server: " << m_config.core_server);
      }

      if (ver_reply->api_major() != SDMS::repository::version::MAJOR) {
        EXCEPT_PARAM(1, "Incompatible messaging api detected major backwards "
                        "breaking changes detected version ("
                            << ver_reply->api_major() << "."
                            << ver_reply->api_minor() << "."
                            << ver_reply->api_patch() << ")");
      }
      if (ver_reply->api_minor() + 9 > SDMS::repository::version::MINOR) {
        DL_WARNING(msg_log_context,
                   "Significant changes in message api detected ("
                       << ver_reply->api_major() << "."
                       << ver_reply->api_minor() << "."
                       << ver_reply->api_patch() << ")");
      }
      bool new_release_available = false;
      if (ver_reply->release_year() > Version::DATAFED_RELEASE_YEAR) {
        new_release_available = true;
      } else if (ver_reply->release_year() == Version::DATAFED_RELEASE_YEAR) {
        if (ver_reply->release_month() > Version::DATAFED_RELEASE_MONTH) {
          new_release_available = true;
        } else if (ver_reply->release_month() ==
                   Version::DATAFED_RELEASE_MONTH) {
          if (ver_reply->release_day() > Version::DATAFED_RELEASE_DAY) {
            new_release_available = true;
          } else if (ver_reply->release_day() == Version::DATAFED_RELEASE_DAY) {
            if (ver_reply->release_hour() > Version::DATAFED_RELEASE_HOUR) {
              new_release_available = true;
            } else if (ver_reply->release_hour() ==
                       Version::DATAFED_RELEASE_HOUR) {
              if (ver_reply->release_minute() >
                  Version::DATAFED_RELEASE_MINUTE) {
                new_release_available = true;
              }
            }
          }
        }
      }

      if (new_release_available) {
        DL_INFO(msg_log_context,
                "Newer releases for the repo server may be available.");
      }

      DL_INFO(msg_log_context, "Core server connection OK.");
      return;
    }
  }
  EXCEPT_PARAM(1,
               "Could not connect with core server: " << m_config.core_server);
}

void Server::loadKeys() {
  string fname = m_config.cred_dir + "datafed-repo-key.pub";
  ifstream inf(fname.c_str());
  if (!inf.is_open() || !inf.good())
    EXCEPT_PARAM(1, "Could not open file: " << fname);
  inf >> m_pub_key;
  inf.close();

  fname = m_config.cred_dir + "datafed-repo-key.priv";
  inf.open(fname.c_str());
  if (!inf.is_open() || !inf.good())
    EXCEPT_PARAM(1, "Could not open file: " << fname);
  inf >> m_priv_key;
  inf.close();

  fname = m_config.cred_dir + "datafed-core-key.pub";
  inf.open(fname.c_str());
  if (!inf.is_open() || !inf.good())
    EXCEPT_PARAM(1, "Could not open file: " << fname);
  inf >> m_core_key;
  inf.close();
}

void Server::ioSecure() {
  try {

    std::unordered_map<SocketRole, SocketOptions> socket_options;
    std::unordered_map<SocketRole, ICredentials *> socket_credentials;

    // Credentials are allocated on the heap, to ensure they last until the end
    // of the test they must be defined outside of the scope block below
    std::unique_ptr<ICredentials> client_credentials;

    std::string client_id = "main_repository_server_interal_facing_socket";
    { // Proxy Client Credentials and Socket Options - these options are used
      // to define the client socket that the proxy will use to communicate with
      // the backend. The proxy acts like a client to the backend
      SocketOptions client_socket_options;
      client_socket_options.scheme = URIScheme::INPROC;
      client_socket_options.class_type = SocketClassType::CLIENT;
      client_socket_options.direction_type =
          SocketDirectionalityType::BIDIRECTIONAL;
      client_socket_options.communication_type =
          SocketCommunicationType::ASYNCHRONOUS;
      client_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
      client_socket_options.protocol_type = ProtocolType::ZQTP;
      client_socket_options.host = "workers";
      client_socket_options.local_id = client_id;
      socket_options[SocketRole::CLIENT] = client_socket_options;

      CredentialFactory cred_factory;
      std::unordered_map<CredentialType, std::string> cred_options;

      client_credentials =
          cred_factory.create(ProtocolType::ZQTP, cred_options);
      socket_credentials[SocketRole::CLIENT] = client_credentials.get();
    }

    // Credentials are allocated on the heap, to ensure they last until the end
    // of the test they must be defined outside of the scope block below
    std::unique_ptr<ICredentials> server_credentials;

    { // Proxy Server Credentials and Socket Options - these options are used
      // to define the server socket that the proxy will use to communicate with
      // the frontend. The proxy acts like a server to the frontend
      SocketOptions server_socket_options;
      server_socket_options.scheme = URIScheme::TCP;
      server_socket_options.class_type = SocketClassType::SERVER;
      server_socket_options.direction_type =
          SocketDirectionalityType::BIDIRECTIONAL;
      server_socket_options.communication_type =
          SocketCommunicationType::ASYNCHRONOUS;
      server_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
      server_socket_options.connection_security =
          SocketConnectionSecurity::SECURE;
      server_socket_options.protocol_type = ProtocolType::ZQTP;
      server_socket_options.host = "*";
      server_socket_options.port = m_config.port;
      server_socket_options.local_id =
          "main_repository_server_external_facing_socket";
      socket_options[SocketRole::SERVER] = server_socket_options;

      CredentialFactory cred_factory;
      std::unordered_map<CredentialType, std::string> cred_options;
      cred_options[CredentialType::PUBLIC_KEY] =
          m_config.sec_ctx->get(CredentialType::PUBLIC_KEY);
      cred_options[CredentialType::PRIVATE_KEY] =
          m_config.sec_ctx->get(CredentialType::PRIVATE_KEY);
      cred_options[CredentialType::SERVER_KEY] =
          m_config.sec_ctx->get(CredentialType::SERVER_KEY);

      server_credentials =
          cred_factory.create(ProtocolType::ZQTP, cred_options);
      socket_credentials[SocketRole::SERVER] = server_credentials.get();
    }

    // Because the (NON-Proxy) server will not be a ROUTER we need to add
    // an operator so the proxy server will be added as a router in the
    // routing part of the message
    //
    // Will add
    //
    // "MiddleMan_client_socket" as a prepended message on its way to the
    // backend server, I think this is only necessary because we have
    // specifiedt that the Server is connecting Synchronously with the proxy

    ServerFactory server_factory(m_log_context);
    auto proxy = server_factory.create(ServerType::PROXY_CUSTOM, socket_options,
                                       socket_credentials);

    std::stringstream addresses;
    for (auto &addr : proxy->getAddresses()) {
      addresses << addr.second << ", ";
    }
    DL_INFO(m_log_context,
            "Created proxy, target addresses are: " << addresses.str());

    proxy->run();
  } catch (exception &e) {
    DL_ERROR(m_log_context, "Exception in secure interface: " << e.what())
  }
}

} // namespace Repo
} // namespace SDMS
