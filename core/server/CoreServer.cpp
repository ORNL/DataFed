// Local private includes
#include "CoreServer.hpp"
#include "ClientWorker.hpp"
#include "Condition.hpp"
#include "DatabaseAPI.hpp"
#include "PublicKeyTypes.hpp"
#include "TaskMgr.hpp"

// DataFed Common includes
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/IServer.hpp"
#include "common/OperatorFactory.hpp"
#include "common/ServerFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/Util.hpp"

// Third party includes
#include <curl/curl.h>

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

namespace Core {

Server::Server(LogContext log_context)
    : m_config(Config::getInstance()), m_log_context(log_context) {
  // One-time global libcurl init
  curl_global_init(CURL_GLOBAL_DEFAULT);

  // Load ZMQ keys
  DL_INFO(m_log_context, "loadKeys from cred dir " << m_config.cred_dir);
  loadKeys(m_config.cred_dir);

  // Configure ZMQ security context
  CredentialFactory cred_factory;
  std::unordered_map<CredentialType, std::string> params;
  params[CredentialType::PUBLIC_KEY] = m_pub_key;
  params[CredentialType::PRIVATE_KEY] = m_priv_key;
  m_config.sec_ctx = cred_factory.create(ProtocolType::ZQTP, params);

  // Wait for DB connection
  waitForDB();

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
  m_auth_manager = std::move(AuthenticationManager(
      purge_intervals, std::move(purge_conditions), m_config.db_url,
      m_config.db_user, m_config.db_pass, m_config.cred_dir));

  // Load repository config from DB
  m_config.loadRepositoryConfig(m_auth_manager, log_context);

  // Start ZAP handler must be started before any other socket binds are called
  // m_zap_thread = thread( &Server::zapHandler, this );

  // Start DB maintenance thread
  m_db_maint_thread =
      thread(&Server::dbMaintenance, this, m_log_context, getNewThreadId());

  // Start DB maintenance thread
  m_repo_cache_thread =
      thread(&Server::repoCacheThread, this, m_log_context, getNewThreadId());

  // Start DB maintenance thread
  m_metrics_thread =
      thread(&Server::metricsThread, this, m_log_context, getNewThreadId());

  // Create task mgr (starts it's own threads)
  TaskMgr::getInstance(m_log_context, getNewThreadId());
}

Server::~Server() {
  // There is no way to cleanly shutdown the server, so this code really has no
  // effect since the o/s cleans-up for us

  // m_zap_thread.join();
  m_db_maint_thread.join();
  m_repo_cache_thread.join();
  m_metrics_thread.join();
}

void Server::loadKeys(const std::string &a_cred_dir) {
  string fname = a_cred_dir + "datafed-core-key.pub";
  ifstream inf(fname.c_str());
  if (!inf.is_open() || !inf.good())
    EXCEPT_PARAM(1, "Could not open public key file: " << fname);
  inf >> m_pub_key;
  inf.close();

  fname = a_cred_dir + "datafed-core-key.priv";
  inf.open(fname.c_str());
  if (!inf.is_open() || !inf.good())
    EXCEPT_PARAM(1, "Could not open private key file: " << fname);
  inf >> m_priv_key;
  inf.close();
}

void Server::waitForDB() {
  DL_INFO(m_log_context, "Waiting for DB...");

  for (int i = 0; i < 10; i++) {
    try {
      std::cout << "waitForDB thread, cred_dir " << m_config.cred_dir << std::endl;
      DatabaseAPI db_client(m_config.db_url, m_config.db_user, m_config.db_pass, m_config.cred_dir);
      db_client.serverPing(m_log_context);
      DL_INFO(m_log_context, "DB Ping Success");
      return;
    } catch (...) {
      DL_INFO(m_log_context, "DB connection error");
    }
    sleep(5);
  }

  EXCEPT(1, "Unable to connect to DB");
}

/**
 * Start and run external interfaces.
 *
 * This method is not really needed anymore. Originally there were separete
 * start/run/pause methods to allow a host program to control conre service, but
 * these features were never needed/used. The functions performed here could be
 * put in the constructor, but leaving them here allows the use of the calling
 * thread ti run one of the interfaces.
 */
void Server::run() {
  DL_INFO(m_log_context, "Public/private MAPI starting on ports "
                             << m_config.port << "/" << (m_config.port + 1))

  m_msg_router_thread =
      thread(&Server::msgRouter, this, m_log_context, getNewThreadId());
  m_io_secure_thread =
      thread(&Server::ioSecure, this, m_log_context, getNewThreadId());
  ioInsecure(m_log_context, m_main_thread_id);

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
      server_socket_options.local_id = "external_facing_secure_proxy_server";
      socket_options[SocketRole::SERVER] = server_socket_options;

      CredentialFactory cred_factory;

      std::unordered_map<CredentialType, std::string> cred_options;
      // cred_options[CredentialType::PUBLIC_KEY] =
      // m_config.sec_ctx->get(CredentialType::PUBLIC_KEY);
      cred_options[CredentialType::PRIVATE_KEY] =
          m_config.sec_ctx->get(CredentialType::PRIVATE_KEY);
      // cred_options[CredentialType::SERVER_KEY] =
      // m_config.sec_ctx->get(CredentialType::SERVER_KEY);

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

void Server::ioInsecure(LogContext log_context, int thread_count) {
  log_context.thread_name += "-ioInsecure";
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
      client_socket_options.connection_security =
          SocketConnectionSecurity::INSECURE;
      client_socket_options.protocol_type = ProtocolType::ZQTP;
      client_socket_options.host = "msg_proc";
      client_socket_options.local_id = "internal_facing_insecure_proxy_client";
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
          SocketConnectionSecurity::INSECURE;
      server_socket_options.protocol_type = ProtocolType::ZQTP;
      server_socket_options.host = "*";
      server_socket_options.port = m_config.port + 1;
      server_socket_options.local_id = "external_facing_secure_proxy_server";
      socket_options[SocketRole::SERVER] = server_socket_options;

      CredentialFactory cred_factory;

      std::unordered_map<CredentialType, std::string> cred_options;

      server_credentials =
          cred_factory.create(ProtocolType::ZQTP, cred_options);
      socket_credentials[SocketRole::SERVER] = server_credentials.get();
    }

    ServerFactory server_factory(log_context);
    auto proxy = server_factory.create(ServerType::PROXY_BASIC_ZMQ,
                                       socket_options, socket_credentials);

    proxy->run();

  } catch (exception &e) {
    DL_ERROR(log_context, "Exception in insecure interface: " << e.what())
  }
}

void Server::dbMaintenance(LogContext log_context, int thread_count) {
  log_context.thread_name += "-dbMaintenance";
  log_context.thread_id = thread_count;
  chrono::system_clock::duration purge_per =
      chrono::seconds(m_config.note_purge_period);
  std::cout << "dbMaintenance thread, cred_dir " << m_config.cred_dir << std::endl;
  DatabaseAPI db(m_config.db_url, m_config.db_user, m_config.db_pass, m_config.cred_dir);

  while (1) {
    try {
      DL_DEBUG(log_context, "DB Maint: Purging closed annotations");
      db.notePurge(m_config.note_purge_age, log_context);
    } catch (TraceException &e) {
      DL_ERROR(log_context, "DB Maint:" << e.toString());
    } catch (exception &e) {
      DL_ERROR(log_context, "DB Maint:" << e.what());
    } catch (...) {
      DL_ERROR(log_context, "DB Maint: Unknown exception");
    }

    this_thread::sleep_for(purge_per);
  }
  DL_ERROR(log_context, "DB maintenance thread exiting");
}

void Server::repoCacheThread(LogContext log_context, int thread_count) {
  // Check to see if repo cache needs to be updated every 60 seconds
  log_context.thread_name += "-repoCacheThread";
  log_context.thread_id = thread_count;
  std::chrono::seconds repo_cache_poll(60);

  while (1) {
    try {
      DL_DEBUG(log_context,
               "Checking if Repo Cache needs Updating, then sleeping for "
                   << std::to_string(repo_cache_poll.count()) << " seconds.");
      m_config.loadRepositoryConfig(m_auth_manager, log_context);
    } catch (const std::exception &e) {
      DL_ERROR(log_context, "Repo Cache Updating... " << e.what());
    } catch (...) {
      DL_ERROR(log_context, "Repo Cache Updating... unknown exception");
    }
    std::this_thread::sleep_for(repo_cache_poll);
  }
  DL_ERROR(log_context, "DB maintenance thread exiting");
}

void Server::metricsThread(LogContext log_context, int thread_count) {
  log_context.thread_name += "-metricsThread";
  log_context.thread_id = thread_count;
  chrono::system_clock::duration metrics_per =
      chrono::seconds(m_config.metrics_period);
  std::cout << "metrics thread, cred_dir " << m_config.cred_dir << std::endl;
  DatabaseAPI db(m_config.db_url, m_config.db_user, m_config.db_pass, m_config.cred_dir);
  map<string, MsgMetrics_t>::iterator u;
  MsgMetrics_t::iterator m;
  uint32_t pc,
      purge_count = m_config.metrics_purge_period / m_config.metrics_period;
  uint32_t total, subtot;
  uint32_t timestamp;
  map<string, MsgMetrics_t> metrics;

  pc = purge_count;

  DL_DEBUG(log_context, "metrics: " << m_config.metrics_purge_period << ", "
                                    << m_config.metrics_period << ", "
                                    << purge_count);

  while (1) {
    try {
      // Lock mutex, swap metrics to local store, release lock
      {
        lock_guard<mutex> lock(m_msg_metrics_mutex);

        m_msg_metrics.swap(metrics);
      }

      timestamp = std::chrono::duration_cast<std::chrono::seconds>(
                      std::chrono::system_clock::now().time_since_epoch())
                      .count();
      total = 0;

      for (u = metrics.begin(); u != metrics.end(); ++u) {
        subtot = 0;
        for (m = u->second.begin(); m != u->second.end(); ++m) {
          subtot += m->second;
        }
        u->second[0] =
            subtot;      // Store total in 0 (0 is never a valid message type)
        total += subtot; // Unlikely to overflow (i.e. > 13.3 million msg/sec )
      }

      db.metricsUpdateMsgCounts(timestamp, total, metrics, log_context);
      metrics.clear();

      if (--pc == 0) {
        DL_DEBUG(log_context, "metrics: purging");
        db.metricsPurge(timestamp - m_config.metrics_purge_age, log_context);
        pc = purge_count;
      }
    } catch (TraceException &e) {
      DL_ERROR(log_context, "Metrics thread:" << e.toString());
    } catch (exception &e) {
      DL_ERROR(log_context, "Metrics thread:" << e.what());
    } catch (...) {
      DL_ERROR(log_context, "Metrics thread: Unknown exception");
    }

    this_thread::sleep_for(metrics_per);
  }
  DL_ERROR(log_context, "Metrics thread exiting");
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

void Server::metricsUpdateMsgCount(const std::string &a_uid,
                                   uint16_t a_msg_type) {
  lock_guard<mutex> lock(m_msg_metrics_mutex);
  map<string, MsgMetrics_t>::iterator u = m_msg_metrics.find(a_uid);
  if (u == m_msg_metrics.end()) {
    m_msg_metrics[a_uid][a_msg_type] = 1;
  } else {
    MsgMetrics_t::iterator m = u->second.find(a_msg_type);
    if (m == u->second.end()) {
      u->second[a_msg_type] = 1;
    } else {
      m->second++;
    }
  }
}

} // namespace Core
} // namespace SDMS
