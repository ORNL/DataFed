// Local private includes
#include "MockCoreServer.hpp"
#include "ClientWorker.hpp"
#include "Condition.hpp"
#include "PublicKeyTypes.hpp"

// DataFed Common includes
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/IServer.hpp"
#include "common/OperatorFactory.hpp"
#include "common/ServerFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// Standard includes
#include <chrono>
#include <fstream>
#include <memory>
#include <time.h>
#include <vector>

#define timerDef() struct timespec _T0 = {0, 0}, _T1 = {0, 0}
#define timerStart() clock_gettime(CLOCK_REALTIME, &_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME, &_T1)
#define timerElapsed()                                                         \
  ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec) / 1.0e9))

#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 3600

using namespace std;

namespace SDMS {

namespace MockCore {

Server::Server(LogContext log_context)
    : m_config(Config::getInstance()), m_log_context(log_context) {

  // Load ZMQ keys
  loadKeys(m_config.cred_dir);

  // Configure ZMQ security context
  CredentialFactory cred_factory;
  std::unordered_map<CredentialType, std::string> params;
  params[CredentialType::PUBLIC_KEY] = m_pub_key;
  params[CredentialType::PRIVATE_KEY] = m_priv_key;
  m_config.sec_ctx = cred_factory.create(ProtocolType::ZQTP, params);

  std::map<PublicKeyType, time_t> purge_intervals;
  const time_t seconds_30 = 30;
  const time_t hours_eight = 60; //*60*8;
  purge_intervals[PublicKeyType::TRANSIENT] = seconds_30;
  purge_intervals[PublicKeyType::SESSION] = hours_eight;

  std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>>
      purge_conditions;

  const size_t accesses_to_promote = 2;
  const PublicKeyType promote_from = PublicKeyType::TRANSIENT;
  const PublicKeyType promote_to = PublicKeyType::SESSION;

  purge_conditions[PublicKeyType::TRANSIENT].emplace_back(
      std::make_unique<Promote>(accesses_to_promote, promote_from, promote_to));

  const size_t accesses_to_reset = 1;
  const PublicKeyType key_type_to_apply_reset = PublicKeyType::SESSION;

  purge_conditions[PublicKeyType::SESSION].emplace_back(
      std::make_unique<Reset>(accesses_to_reset, key_type_to_apply_reset));

  // Must occur after loading config settings
  m_auth_manager = std::move(
      AuthenticationManager(purge_intervals, std::move(purge_conditions)));

  for (auto &r : m_config.getRepos()) {
    m_auth_manager.addKey(PublicKeyType::PERSISTENT, r.second.pub_key(),
                          r.second.id());
  }
}

Server::~Server() {
  // There is no way to cleanly shutdown the server, so this code really has no
  // effect since the o/s cleans-up for us

  // m_zap_thread.join();
}

void Server::loadKeys(const std::string &a_cred_dir) {
  string fname = a_cred_dir + "mock-datafed-core-key.pub";
  ifstream inf(fname.c_str());
  if (!inf.is_open() || !inf.good()) {
    EXCEPT_PARAM(1, std::string("Could not open public key file: ") + fname);
  }
  inf >> m_pub_key;
  inf.close();

  fname = a_cred_dir + "mock-datafed-core-key.priv";
  inf.open(fname.c_str());
  if (!inf.is_open() || !inf.good())
    EXCEPT_PARAM(1, std::string("Could not open private key file: ") + fname);
  inf >> m_priv_key;
  inf.close();

  std::cout << "Public key is: " << m_pub_key << std::endl;
  std::cout << "Private key is: " << m_priv_key << std::endl;
}

/**
 * Start and run external interfaces.
 *
 * This method is no longer strictly necessary. Originally, separate
 * start, run, and pause methods were implemented to allow a host program
 * to control the core service, but these features were never needed or used.
 * The functions performed here could be moved to the constructor; however,
 * keeping them in this method allows the calling thread to run one of the
 * interfaces.
 */
void Server::run() {
  DL_INFO(m_log_context, "Public/private MAPI starting on ports "
                             << m_config.port << "/" << (m_config.port + 1))

  m_msg_router_thread =
      thread(&Server::msgRouter, this, m_log_context, getNewThreadId());
  m_io_secure_thread =
      thread(&Server::ioSecure, this, m_log_context, getNewThreadId());

  m_msg_router_thread.join();
}

void Server::msgRouter(LogContext log_context, int thread_count) {
  log_context.thread_name += "-msgRouter";
  log_context.thread_id = thread_count;
  std::unordered_map<SocketRole, SocketOptions> socket_options;
  std::unordered_map<SocketRole, ICredentials *> socket_credentials;

  // Credentials are allocated on the heap, to ensure they last until the end of
  // the test they must be defined outside of the scope block below
  std::unique_ptr<ICredentials> client_credentials;

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
    client_socket_options.connection_security =
        SocketConnectionSecurity::INSECURE;
    client_socket_options.protocol_type = ProtocolType::ZQTP;
    client_socket_options.host = "workers";
    client_socket_options.local_id = "core_message_routing_client";
    socket_options[SocketRole::CLIENT] = client_socket_options;

    CredentialFactory cred_factory;
    std::unordered_map<CredentialType, std::string> cred_options;

    client_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
    socket_credentials[SocketRole::CLIENT] = client_credentials.get();
  }

  // Credentials are allocated on the heap, to ensure they last until the end of
  // the test they must be defined outside of the scope block below
  std::unique_ptr<ICredentials> server_credentials;

  { // Proxy Server Credentials and Socket Options - these options are used
    // to define the server socket that the proxy will use to communicate with
    // the frontend. The proxy acts like a server to the frontend
    SocketOptions server_socket_options;
    server_socket_options.scheme = URIScheme::INPROC;
    server_socket_options.class_type = SocketClassType::SERVER;
    server_socket_options.direction_type =
        SocketDirectionalityType::BIDIRECTIONAL;
    server_socket_options.communication_type =
        SocketCommunicationType::ASYNCHRONOUS;
    server_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
    server_socket_options.connection_security =
        SocketConnectionSecurity::INSECURE;
    server_socket_options.protocol_type = ProtocolType::ZQTP;
    server_socket_options.host = "msg_proc";
    server_socket_options.local_id = "core_message_routing_server";
    socket_options[SocketRole::SERVER] = server_socket_options;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;

    server_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
    socket_credentials[SocketRole::SERVER] = server_credentials.get();
  }

  ServerFactory server_factory(log_context);
  auto proxy = server_factory.create(ServerType::PROXY_BASIC_ZMQ,
                                     socket_options, socket_credentials);

  // Ceate worker threads
  for (uint16_t t = 0; t < m_config.num_client_worker_threads; ++t) {
    LogContext log_context_client = log_context;
    log_context_client.thread_id = getNewThreadId();
    m_workers.emplace_back(new ClientWorker(*this, t + 1, log_context_client));
  }

  proxy->run();

  // Clean-up workers
  vector<std::shared_ptr<ClientWorker>>::iterator iwrk;

  for (iwrk = m_workers.begin(); iwrk != m_workers.end(); ++iwrk)
    (*iwrk)->stop();
}

int Server::getNewThreadId() {
  lock_guard<mutex> lock(m_thread_count_mutex);
  ++m_thread_count;
  return m_thread_count;
}

void Server::ioSecure(LogContext log_context, int thread_count) {

  log_context.thread_name += "-ioSecure";
  log_context.thread_id = thread_count;
  try {

    std::unordered_map<SocketRole, SocketOptions> socket_options;
    std::unordered_map<SocketRole, ICredentials *> socket_credentials;

    // Credentials are allocated on the heap, to ensure they last until the end
    // of the test they must be defined outside of the scope block below
    std::unique_ptr<ICredentials> client_credentials;

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
      client_socket_options.connection_life =
          SocketConnectionLife::INTERMITTENT;
      // Does not need to be secure, msg_proc is facing inside and is using
      // INPROC
      client_socket_options.connection_security =
          SocketConnectionSecurity::INSECURE;
      client_socket_options.protocol_type = ProtocolType::ZQTP;
      client_socket_options.host = "msg_proc";
      // client_socket_options.port = 1341;
      client_socket_options.local_id = "internal_facing_secure_proxy_client";
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
      // the web server and repo server. The proxy acts like a server to the
      // frontend
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
      server_socket_options.local_id = "external_facing_secure_proxy_server";
      socket_options[SocketRole::SERVER] = server_socket_options;

      CredentialFactory cred_factory;

      std::unordered_map<CredentialType, std::string> cred_options;
      cred_options[CredentialType::PRIVATE_KEY] =
          m_config.sec_ctx->get(CredentialType::PRIVATE_KEY);

      server_credentials =
          cred_factory.create(ProtocolType::ZQTP, cred_options);
      socket_credentials[SocketRole::SERVER] = server_credentials.get();
    }

    std::any argument = dynamic_cast<IAuthenticationManager *>(&m_auth_manager);
    OperatorFactory operator_factory;
    std::vector<std::unique_ptr<IOperator>> operators;
    operators.push_back(
        operator_factory.create(OperatorType::Authenticator, argument));

    ServerFactory server_factory(log_context);
    auto proxy =
        server_factory.create(ServerType::PROXY_CUSTOM, socket_options,
                              socket_credentials, std::move(operators));

    proxy->run();

  } catch (exception &e) {
    DL_ERROR(log_context, "Exception in secure interface: " << e.what())
  }
}

// Triggered by client worker
void Server::authenticateClient(const std::string &a_cert_uid,
                                const std::string &a_key,
                                const std::string &a_uid,
                                LogContext log_context) {

  DL_INFO(log_context, "authenticateClient a_cert_uid is "
                           << a_cert_uid << " a_uid is " << a_uid);
  if (a_cert_uid.compare("anon") == 0) {
    m_auth_manager.addKey(PublicKeyType::TRANSIENT, a_key, a_uid);
  }
}

} // namespace MockCore
} // namespace SDMS
