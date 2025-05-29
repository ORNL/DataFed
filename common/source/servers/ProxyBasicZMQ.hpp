#ifndef PROXY_BASIC_ZMQ_HPP
#define PROXY_BASIC_ZMQ_HPP
#pragma once

// Local public includes
#include "common/ICommunicator.hpp"
#include "common/IServer.hpp"
#include "common/ISocket.hpp"
#include "common/SocketOptions.hpp"

// Standard includes
#include <chrono>
#include <memory>
#include <string>
#include <unordered_map>

namespace SDMS {

class ProxyBasicZMQ : public IServer {
private:
  std::unique_ptr<ISocket> m_client_socket;
  std::unique_ptr<ISocket> m_server_socket;
  bool m_run_infinite_loop = true;
  std::chrono::duration<double> m_run_duration;
  // If need more print statements to debug turn on
  bool m_debug_output = true;
  int m_client_zmq_type;
  int m_server_zmq_type;

  int m_thread_count = 0;
  std::unordered_map<SocketRole, std::string> m_addresses;
  std::string m_client_host = "";
  std::string m_server_host = "";
  LogContext m_log_context;

public:
  /// Convenience constructor
  ProxyBasicZMQ(
      const std::unordered_map<SocketRole, SocketOptions> &socket_options,
      const std::unordered_map<SocketRole, ICredentials *> &socket_credentials,
      LogContext log_context);

  virtual ~ProxyBasicZMQ() {};
  
  virtual ServerType type() const noexcept final {
    return ServerType::PROXY_BASIC_ZMQ;
  }
  /**
   * By default will run forever you can specify a time to run the for instead
   *
   * std::chrono::duration<double> duration = std::chrono::seconds(1);
   * setRunDuration(duration)
   **/
  virtual void setRunDuration(std::chrono::duration<double> duration) final;

  virtual void run() final;

  virtual std::unordered_map<SocketRole, std::string>
  getAddresses() const final {
    return m_addresses;
  }
};

} // namespace SDMS

#endif // PROXY_BASIC_ZMQ_HPP
