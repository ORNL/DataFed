#ifndef PROXY_HPP
#define PROXY_HPP
#pragma once

// Local public includes
#include "common/ICommunicator.hpp"
#include "common/IOperator.hpp"
#include "common/IServer.hpp"
#include "common/ISocket.hpp"
#include "common/SocketOptions.hpp"

// Standard includes
#include <chrono>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace SDMS {

class Proxy : public IServer {
private:
  uint32_t m_timeout_on_receive_milliseconds = 50;
  long m_timeout_on_poll_milliseconds = 50;
  std::vector<std::unique_ptr<IOperator>> m_incoming_operators;
  std::unordered_map<SocketRole, std::unique_ptr<ICommunicator>>
      m_communicators;
  bool m_run_infinite_loop = true;
  std::chrono::duration<double> m_run_duration;
  int m_thead_count = 0;
  LogContext m_log_context;
  std::unordered_map<SocketRole, std::string> m_addresses;

public:
  /// Convenience constructor
  Proxy(
      const std::unordered_map<SocketRole, SocketOptions> &socket_options,
      const std::unordered_map<SocketRole, ICredentials *> &socket_credentials,
      LogContext log_context);

  Proxy(
      const std::unordered_map<SocketRole, SocketOptions> &socket_options,
      const std::unordered_map<SocketRole, ICredentials *> &socket_credentials,
      std::vector<std::unique_ptr<IOperator>> incoming_operators,
      LogContext log_context);

  virtual ~Proxy() {};

  virtual ServerType type() const noexcept final {
    return ServerType::PROXY_CUSTOM;
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

#endif // PROXY_HPP
