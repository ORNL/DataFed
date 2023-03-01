#ifndef ISOCKET_HPP
#define ISOCKET_HPP
#pragma once

// Local includes
#include "ICredentials.hpp"
#include "ProtocolTypes.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <string>
#include <variant>

namespace SDMS {

class ISocket {

  public:
    /*********************************************************
     * Getters
     *********************************************************/
    virtual SocketClassType getSocketClassType() const noexcept = 0;
    virtual SocketCommunicationType getSocketCommunicationType() const noexcept = 0;
    virtual SocketDirectionalityType getSocketDirectionalityType() const noexcept = 0;
    virtual SocketConnectionLife getSocketConnectionLife() const noexcept = 0;

    virtual ProtocolType getProtocolType() const noexcept = 0;
    virtual std::string getAddress() const noexcept = 0;
    virtual std::variant<std::string> get(const CredentialType credential_type) const = 0;

    /**
     * Get an identifier to the local socket host/thread/process, requires
     * users setting the local_id in the socket options otherwise a random
     * identifier will be created.
     **/
    virtual std::string getID() const noexcept = 0;
};

} // SDMS

#endif // ISOCKET_HPP
