#ifndef SERVER_FACTORY_HPP
#define SERVER_FACTORY_HPP
#pragma once

// Local public includes
#include "DynaLog.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <memory>
#include <unordered_map>
#include <vector>

namespace SDMS {

  class ICredentials;
  class IOperator;
  class IServer;

  enum class SocketRole {
    CLIENT,
    SERVER,
    MONITOR,
    CONTROL
  };

  /**
   * The custom proxy server is not required to use ZMQ, it can work with
   * any hanldes hence there is no need to specify the PROTOCOL. The others
   * use convenience objects provided by zmq and are thus technology specific.
   **/
  enum class ServerType {
    PROXY_CUSTOM,
    PROXY_BASIC_ZMQ,
    ROUTER_ZMQ
  };

  class ServerFactory {
      LogContext m_log_context;
    public:
      ServerFactory(LogContext log_context) : m_log_context(log_context) {};

      std::unique_ptr<IServer> create(
          ServerType server_type,
          const std::unordered_map<SocketRole, SocketOptions> & socket_options,
          const std::unordered_map<SocketRole, ICredentials *> & socket_credentials
          );


      std::unique_ptr<IServer> create(
          ServerType server_type,
          const std::unordered_map<SocketRole, SocketOptions> & socket_options,
          const std::unordered_map<SocketRole, ICredentials *> & socket_credentials,
          std::vector<std::unique_ptr<IOperator>> incoming_operators
          );
  };

} // namespace SDMS

#endif // SERVER_FACTORY_HPP
