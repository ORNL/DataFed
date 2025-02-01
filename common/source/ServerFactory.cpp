
// Local private includes
#include "servers/Proxy.hpp"
#include "servers/ProxyBasicZMQ.hpp"
// Local public includes
#include "common/IServer.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <memory>
#include <unordered_map>
#include <vector>

namespace SDMS {

std::unique_ptr<IServer> ServerFactory::create(
    ServerType server_type,
    const std::unordered_map<SocketRole, SocketOptions> &socket_options,
    const std::unordered_map<SocketRole, ICredentials *> &socket_credentials) {

  return create(server_type, socket_options, socket_credentials,
                std::vector<std::unique_ptr<IOperator>>());
}

std::unique_ptr<IServer> ServerFactory::create(
    ServerType server_type,
    const std::unordered_map<SocketRole, SocketOptions> &socket_options,
    const std::unordered_map<SocketRole, ICredentials *> &socket_credentials,
    std::vector<std::unique_ptr<IOperator>> incoming_operators) {

  if (server_type == ServerType::PROXY_CUSTOM) {
    return std::unique_ptr<IServer>(
        new Proxy(socket_options, socket_credentials,
                  std::move(incoming_operators), m_log_context));
  } else if (server_type == ServerType::PROXY_BASIC_ZMQ) {
    if (incoming_operators.size() > 0) {
      EXCEPT_PARAM(1, "Error building PROXY_BASIC_ZMQ server, operators have "
                      "been provided that will never be used!");
    }
    return std::unique_ptr<IServer>(
        new ProxyBasicZMQ(socket_options, socket_credentials, m_log_context));
  }

  EXCEPT_PARAM(1, "Error Server type unsupported");
}

} // namespace SDMS
