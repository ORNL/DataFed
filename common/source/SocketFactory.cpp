
// Local private includes
#include "communicators/ZeroMQCommunicator.hpp"
#include "sockets/ZeroMQSocket.hpp"

// Local public includes
#include "SocketFactory.hpp"
#include "TraceException.hpp"

// Standard includes
#include <memory>

namespace SDMS {

  std::unique_ptr<ISocket> SocketFactory::create(
      const SocketOptions & socket_options,
      const ICredentials & credentials) const {

    if(socket_options.protocol_type == ProtocolType::ZQTP ) {
      return std::unique_ptr<ISocket>(new ZeroMQSocket(
            socket_options,
            credentials));
    }
    EXCEPT(1, "Unsupported ProtocolType specified in SocketFactory.");
  }

} // namespace SDMS
