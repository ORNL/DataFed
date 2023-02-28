#ifndef PROXY_HPP
#define PROXY_HPP
#pragma once

// Local public includes
#include "ICommunicator.hpp"
#include "IOperator.hpp"
#include "ISocket.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <chrono>
#include <memory>
#include <vector>
#include <unordered_map>

namespace SDMS {

class Proxy {
  public:
    enum class SocketRole {
      CLIENT,
      SERVER,
      MONITOR
    };

  private:


    uint32_t m_timeout_on_receive_milliseconds = 50;
    long m_timeout_on_poll_milliseconds = 50;
    std::vector<std::unique_ptr<IOperator>> m_incoming_operators;
    std::unordered_map<SocketRole, std::unique_ptr<ICommunicator>> m_communicators;
    bool m_run_infinite_loop = true;
    std::chrono::duration<double> m_run_duration;

  public:
    /// Convenience constructor
    Proxy(
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials *> & socket_credentials);

    Proxy(
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials *> & socket_credentials,
      std::vector<std::unique_ptr<IOperator>> incoming_operators);

    /**
     * By default will run forever you can specify a time to run the for instead
     * 
     * std::chrono::duration<double> duration = std::chrono::seconds(1);
     * setRunDuration(duration)
     **/
    void setRunDuration(std::chrono::duration<double> duration);

    void run();
};

} // namespace SDMS

#endif // PROXY_HPP
