
// Local private includes
#include "communicators/ZeroMQCommunicator.hpp"
#include "sockets/ZeroMQSocket.hpp"
#include "communicators/HTTPCommunicator.hpp"
#include "sockets/HTTPSocket.hpp"

// Local public includes
#include "common/SocketFactory.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <memory>

namespace SDMS {

std::unique_ptr<ISocket>
SocketFactory::create(const SocketOptions &socket_options,
                      const ICredentials &credentials) const {

  if (socket_options.protocol_type == ProtocolType::ZQTP) {
    return std::unique_ptr<ISocket>(
        new ZeroMQSocket(socket_options, credentials));
  }
  
  else if (socket_options.protocol_type == ProtocolType::HTTP) {
    return std::unique_ptr<ISocket>(
        new HTTPSocket(socket_options, credentials));
  }
  
  EXCEPT(1, "Unsupported ProtocolType specified in SocketFactory.");
}

} // namespace SDMS
