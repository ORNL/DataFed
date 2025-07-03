#ifndef ZEROMQ_SOCKETCREDENTIALS_HPP
#define ZEROMQ_SOCKETCREDENTIALS_HPP
#pragma once

// Local includes
#include "common/ICredentials.hpp"
#include "common/ProtocolTypes.hpp"

// Standard includes
#include <optional>
#include <string>
#include <unordered_map>

namespace SDMS {

class ZeroMQSocketCredentials : public ICredentials {
private:
  std::optional<std::string> m_public_key;
  std::optional<std::string> m_private_key;
  std::optional<std::string> m_server_key;

  void validate();

public:

  virtual ~ZeroMQSocketCredentials() {};

  ZeroMQSocketCredentials() = default;

  ZeroMQSocketCredentials(
      const std::unordered_map<CredentialType, std::string> &);

  ZeroMQSocketCredentials(const std::string &public_key,
                          const std::string &private_key,
                          const std::string &server_key);

  virtual ProtocolType getType() const noexcept final {
    return ProtocolType::ZQTP;
  }
  virtual std::string get(const CredentialType) const final;

  inline virtual bool has(CredentialType type) const noexcept final {
    if (CredentialType::PUBLIC_KEY == type) {
      if (m_public_key) {
        return true;
      }
    }
    if (CredentialType::PRIVATE_KEY == type) {
      if (m_private_key) {
        return true;
      }
    }
    if (CredentialType::SERVER_KEY == type) {
      if (m_server_key) {
        return true;
      }
    }
    return false;
  }
};

} // namespace SDMS

#endif // ZEROMQ_SOCKETCREDENTIALS_HPP
