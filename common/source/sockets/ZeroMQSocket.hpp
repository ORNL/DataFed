#ifndef SOCKET_HPP
#define SOCKET_HPP
#pragma once

// Local private includes
#include "../credentials/ZeroMQSocketCredentials.hpp"

// Local public includes
#include "ISocket.hpp"
#include "ICredentials.hpp"
#include "ProtocolTypes.hpp"

// Standard includes
#include <variant>

namespace SDMS {

class ZeroMQSocket : public ISocket {
  private: 
    URIScheme m_scheme;
    SocketClassType m_socket_class_type;
    SocketCommunicationType m_socket_communication_type;
    SocketDirectionalityType m_socket_directionality_type;
    std::string m_host = "";
    std::string m_id = "";
    uint16_t m_port = -1;
    ZeroMQSocketCredentials m_credentials;

  public:

    ZeroMQSocket(
        const SocketOptions & socket_options,
        const ICredentials & socket_credentials
        );

    /*********************************************************
     * Getters
     *********************************************************/

    virtual SocketClassType getSocketClassType() const noexcept final {
      return m_socket_class_type;
    };

    virtual SocketCommunicationType getSocketCommunicationType() const noexcept final {
      return m_socket_communication_type;
    };

    virtual SocketDirectionalityType getSocketDirectionalityType() const noexcept final {
      return m_socket_directionality_type;
    };

    virtual ProtocolType getProtocolType() const noexcept final {
      return ProtocolType::ZQTP;
    };

    virtual std::string getAddress() const noexcept final;

    virtual std::variant<std::string> get(const CredentialType credential_type) const final;
    
    virtual std::string getID() const noexcept final;
};

} // namespace SDMS

#endif // SOCKET_HPP
