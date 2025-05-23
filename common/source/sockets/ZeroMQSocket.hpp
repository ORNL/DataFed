#ifndef SOCKET_HPP
#define SOCKET_HPP
#pragma once

// Local private includes
#include "../credentials/ZeroMQSocketCredentials.hpp"

// Local public includes
#include "common/ICredentials.hpp"
#include "common/ISocket.hpp"
#include "common/ProtocolTypes.hpp"

namespace SDMS {

class ZeroMQSocket : public ISocket {
private:
  URIScheme m_scheme;
  SocketClassType m_socket_class_type;
  SocketCommunicationType m_socket_communication_type;
  SocketDirectionalityType m_socket_directionality_type;
  SocketConnectionLife m_socket_life;
  std::string m_host = "";
  std::string m_id = "";
  std::optional<uint16_t> m_port;

  std::optional<ZeroMQSocketCredentials> m_credentials;

public:
  ZeroMQSocket(const SocketOptions &socket_options,
               const ICredentials &socket_credentials);

  ZeroMQSocket(const SocketOptions &socket_options);

  ~ZeroMQSocket() {};
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
    return ProtocolType::ZQTP;
  };

  virtual URIScheme getSocketScheme() const noexcept final {
    return m_scheme;
  }

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

#endif // SOCKET_HPP
