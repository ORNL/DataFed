#ifndef HTTP_SOCKET_HPP
#define HTTP_SOCKET_HPP
#pragma once

// Local private includes
#include "../credentials/HTTPCredentials.hpp"

// Local public includes
#include "common/ICredentials.hpp"
#include "common/ISocket.hpp"
#include "common/ProtocolTypes.hpp"

namespace SDMS {

class HTTPSocket : public ISocket {
private:
  URIScheme m_scheme;
  SocketClassType m_socket_class_type;
  SocketCommunicationType m_socket_communication_type;
  SocketDirectionalityType m_socket_directionality_type;
  SocketConnectionLife m_socket_life;
  std::string m_host = "";
  std::string m_id = "";
  std::optional<uint16_t> m_port;

  std::optional<HTTPCredentials> m_credentials;

public:
  HTTPSocket(const SocketOptions &socket_options,
               const ICredentials &socket_credentials);

  HTTPSocket(const SocketOptions &socket_options);

  /*********************************************************
   * Getters
   *********************************************************/

  virtual SocketClassType getSocketClassType() const noexcept final {
    return m_socket_class_type;
  };

  virtual SocketCommunicationType
  getSocketCommunicationType() const noexcept final {
    return m_socket_communication_type;
  };

  virtual SocketDirectionalityType
  getSocketDirectionalityType() const noexcept final {
    return m_socket_directionality_type;
  };

  virtual SocketConnectionLife getSocketConnectionLife() const noexcept final {
    return m_socket_life;
  };

  virtual ProtocolType getProtocolType() const noexcept final {
    return ProtocolType::HTTP;
  };

  virtual std::string getAddress() const noexcept final;

  virtual std::string get(const CredentialType credential_type) const final;

  virtual std::string getID() const noexcept final;

  inline virtual bool hasCredentials() const noexcept final {
    if (m_credentials) {
      if (m_credentials->has(CredentialType::PUBLIC_KEY)) {
        return true;
      } else if (m_credentials->has(CredentialType::PRIVATE_KEY)) {
        return true;
      } else if (m_credentials->has(CredentialType::SERVER_KEY)) {
        return true;
      }
    }
    return false;
   }
};

} // namespace SDMS

#endif // HTTP_SOCKET_HPP
