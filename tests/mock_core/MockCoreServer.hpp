#ifndef CORESERVER_HPP
#define CORESERVER_HPP
#pragma once

// Local private includes
#include "AuthenticationManager.hpp"
#include "Config.hpp"
#include "IMockCoreServer.hpp"

// Public common includes
#include "common/DynaLog.hpp"

// Standard includes
#include <condition_variable>
#include <map>
#include <memory>
#include <mutex>
#include <stdint.h>
#include <string>
#include <sys/types.h>
#include <thread>
#include <unistd.h>

namespace SDMS {
namespace MockCore {

class ClientWorker;

/**
 * The CoreServer class creates and manages all core services.
 *
 * The CoreServer class initializes and manages all of the worker threads of the
 * core service and serves as a message router for all in-coming messages (both
 * client and other distributed services). The various threads run by the
 * CoreServer include client authentication, message routing, background task
 * processing, and maintenance functions.
 *
 * Most DataFed client and server communication is based on message-passing
 * using Google protobuf messages over encrypted ZeroMQ connections. The
 * communication from the web client to the DataFed web service, and the
 * communication between the DatabaseAPI and ArangoDB is based on JSON over
 * HTTP/S. The CoreServer handles all ZeroMQ messaging and delegates the HTTP/S
 * to the web server and DatabaseAPI class.
 *
 * There are two ZeroMQ interfaces exposed by the CoreServer at the configured
 * port and port + 1. The former is a secure interface used for all non-local
 * communication, and the latter is insecure for use by trusted local processes.
 * Messages received from either interface are routed to the same worker threads
 * for processing.
 *
 * The ICoreServer interface class exposes an authenticateClient method to
 * client workers for manual (password) and token-based authentication.
 */
class Server : public IMockCoreServer {
public:
  /// CoreServer constructor (uses Config singleton)
  explicit Server(LogContext);

  /// CoreServer destructor
  virtual ~Server();

  /// Disallow instance copying
  Server &operator=(const Server &) = delete;

  /// Start and run Core service interfaces. This method does not return.
  void run();

private:
  /// Used to manage purging and public auth keys
  AuthenticationManager m_auth_manager;

  /**
   * This method is called after a public key has been authenticated, the key is
   *then made an authorized transient key.
   **/
  void authenticateClient(const std::string &a_cert_uid,
                          const std::string &a_key, const std::string &a_uid,
                          LogContext log_context);
  void metricsUpdateMsgCount(const std::string &a_uid, uint16_t a_msg_type);
  // bool isClientAuthenticated( const std::string & a_client_key, std::string &
  // a_uid );
  void loadKeys(const std::string &a_cred_dir);
  void msgRouter(LogContext log_context, int thread_count);

  // Needed for communications between authz and core service
  void ioSecure(LogContext log_context, int thread_count);
  int getNewThreadId();

  Config &m_config;                ///< Ref to configuration singleton
  std::thread m_io_secure_thread;  ///< Secure I/O thread handle
  std::string m_pub_key;           ///< Public key for secure interface
  std::string m_priv_key;          ///< Private key for secure interface
  std::thread m_msg_router_thread; ///< Main message router thread handle
  std::mutex m_thread_count_mutex; ///< Mutex for metrics updates
  std::vector<std::shared_ptr<ClientWorker>>
      m_workers; ///< List of ClientWorker instances
  LogContext m_log_context;
  int m_thread_count = 0; // Keep track of the number of threads created
  int m_main_thread_id = 0;
};

} // namespace MockCore
} // namespace SDMS

#endif
