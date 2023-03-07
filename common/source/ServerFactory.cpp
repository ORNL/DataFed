
// Local private includes
#include "servers/Proxy.hpp"

// Local public includes
#include "IServer.hpp"
#include "SocketOptions.hpp"
#include "TraceException.hpp"

// Standard includes
#include <memory>
#include <unordered_map>
#include <vector>

namespace SDMS {

  std::unique_ptr<IServer> ServerFactory::create(
      ServerType server_type,
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials *> & socket_credentials) {

    return create(server_type, socket_options, socket_credentials, std::vector<std::unique_ptr<IOperator>>());
  }


  std::unique_ptr<IServer> ServerFactory::create(
      ServerType server_type,
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials *> & socket_credentials,
      std::vector<std::unique_ptr<IOperator>> incoming_operators) {

    if( server_type == ServerType::PROXY_CUSTOM ) {
      return std::unique_ptr<IServer>(new Proxy(socket_options, socket_credentials, std::move(incoming_operators)));
    }

    EXCEPT_PARAM(1, "Error Server type unsupported");

  }

} // namespace SDMS

