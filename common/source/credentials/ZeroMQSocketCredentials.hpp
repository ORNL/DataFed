#ifndef ZEROMQ_SOCKETCREDENTIALS_HPP
#define ZEROMQ_SOCKETCREDENTIALS_HPP
#pragma once

// Local includes
#include "ICredentials.hpp"
#include "ProtocolTypes.hpp"

// Standard includes
#include <string>
#include <variant>

namespace SDMS {

class ZeroMQSocketCredentials : public ICredentials {
  private:
    std::string m_public_key = "";
    std::string m_private_key = "";
    std::string m_server_key = "";

  public:

    ZeroMQSocketCredentials() = default;

    ZeroMQSocketCredentials(
        const std::string & public_key,
        const std::string & private_key,
        const std::string & server_key) :
      m_public_key(public_key),
      m_private_key(private_key),
      m_server_key(server_key) {};

    virtual ProtocolType getType() const noexcept final { return ProtocolType::ZQTP; }
    virtual std::variant<std::string> get(const CredentialType) const final;
};

} // namespace SDMS

#endif // ZEROMQ_SOCKETCREDENTIALS_HPP
