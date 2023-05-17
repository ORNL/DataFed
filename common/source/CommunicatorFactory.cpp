
// Local private includes
#include "communicators/ZeroMQCommunicator.hpp"
#include "communicators/ZeroMQCommunicatorSecure.hpp"
#include "sockets/ZeroMQSocket.hpp"

// Local public includes
#include "common/CommunicatorFactory.hpp"

// Standard includes
#include <memory>

namespace SDMS {

  std::unique_ptr<ICommunicator> CommunicatorFactory::create(
      const SocketOptions & socket_options,
      const ICredentials & credentials,
      uint32_t timeout_on_receive,
      long timeout_on_poll) const {

    if(socket_options.protocol_type == ProtocolType::ZQTP ) {
      if(socket_options.connection_security == SocketConnectionSecurity::INSECURE){
        std::cout << __FILE__ << ":" << __LINE__ << " INSECURE CONSTRUCTOR " << std::endl;
        return std::unique_ptr<ICommunicator>(new ZeroMQCommunicator(
              socket_options,
              credentials,
              timeout_on_receive,
              timeout_on_poll,
              m_log_line));
      } else {
        std::cout << __FILE__ << ":" << __LINE__ << " SECURE CONSTRUCTOR " << std::endl;
        return std::unique_ptr<ICommunicator>(new ZeroMQCommunicatorSecure(
              socket_options,
              credentials,
              timeout_on_receive,
              timeout_on_poll,
              m_log_line));
      }
    }
    return std::unique_ptr<ICommunicator>();
  }

} // namespace SDMS
