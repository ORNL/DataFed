
// Local private includes
#include "ZeroMQSocket.hpp"
#include "../credentials/ZeroMQSocketCredentials.hpp"

// Local public includes
#include "ICredentials.hpp"
#include "TraceException.hpp"

// Standard includes
#include <iostream>
#include <random>
#include <string>

namespace SDMS {

  namespace {

    std::string generateRandomID() {
      static auto& allowed_characters = "0123456789"
        "abcdefghijklmnopqrstuvwxyz"
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

      thread_local static std::mt19937 random_number_generator{std::random_device{}()};
      thread_local static std::uniform_int_distribution<std::string::size_type> distribution(0, sizeof(allowed_characters) - 2);

      std::string s;
      std::string::size_type length = 10;
      s.reserve(length);

      while(length--) {
        s += allowed_characters[distribution(random_number_generator)];
      }

      return s;
    }

  } // namespace - local file scope

ZeroMQSocket::ZeroMQSocket(
        const SocketOptions & socket_options,
        const ICredentials & socket_credentials
        ) : 
  m_scheme(socket_options.scheme),
  m_socket_class_type(socket_options.class_type),
  m_socket_communication_type(socket_options.communication_type),
  m_socket_directionality_type(socket_options.direction_type),
  m_socket_life(socket_options.connection_life),
  m_host(socket_options.host) {

  if(socket_options.port){
    m_port = *socket_options.port;
  }
  if( socket_options.local_id ) {
    m_id = *socket_options.local_id;
  } else {
    m_id = generateRandomID();
  }

  if(m_scheme != URIScheme::INPROC and m_scheme != URIScheme::TCP ){
    EXCEPT(1, "Unsupported scheme detected for ZeroMQSocket");
  }

  // Make sure that the credentials are expected
  try {
    m_credentials = dynamic_cast<const ZeroMQSocketCredentials &>(socket_credentials); 
  } catch ( std::exception & e) {
    std::string error_msg = "Error in constructing ZeroMQSocket, unssuported Credentials were provided: ";
    error_msg += e.what();
    EXCEPT(1, error_msg);
  }
}

std::string ZeroMQSocket::getAddress() const noexcept {
  std::string address = "inproc://";
  if(m_scheme == URIScheme::TCP) { 
    address = "tcp://";
  }
  address += m_host;
  if( m_port ) {
    address += ":" + std::to_string( *m_port );
  } 
  return address;
}

std::variant<std::string> ZeroMQSocket::get(const CredentialType credential_type) const {
  return m_credentials.get(credential_type);
}

std::string ZeroMQSocket::getID() const noexcept {
  return m_id;
}

} // namespace SDMS
