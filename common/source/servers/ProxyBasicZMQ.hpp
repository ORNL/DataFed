#ifndef PROXY_BASIC_ZMQ_HPP
#define PROXY_BASIC_ZMQ_HPP
#pragma once

// Local public includes
#include "ICommunicator.hpp"
#include "IServer.hpp"
#include "ISocket.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <chrono>
#include <memory>
#include <unordered_map>

namespace SDMS {


class ProxyBasicZMQ : public IServer {
  private:

    std::unique_ptr<ISocket> m_client_socket;
    std::unique_ptr<ISocket> m_server_socket;
    bool m_run_infinite_loop = true;
    std::chrono::duration<double> m_run_duration;

    int m_client_zmq_type;
    int m_server_zmq_type;
  public:
    /// Convenience constructor
    ProxyBasicZMQ(
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials *> & socket_credentials);

    virtual ServerType type() const noexcept final { return ServerType::PROXY_BASIC_ZMQ; }
    /**
     * By default will run forever you can specify a time to run the for instead
     * 
     * std::chrono::duration<double> duration = std::chrono::seconds(1);
     * setRunDuration(duration)
     **/
    virtual void setRunDuration(std::chrono::duration<double> duration) final;

    virtual void run() final;
};

} // namespace SDMS

#endif // PROXY_BASIC_ZMQ_HPP
