#ifndef ICREDENTIALS_HPP
#define ICREDENTIALS_HPP
#pragma once

// Local includes
#include "ProtocolTypes.hpp"

// Standard includes
#include <string>
#include <variant>

namespace SDMS {

  enum class CredentialType {
    PUBLIC_KEY,
    PRIVATE_KEY,
    SERVER_KEY
  };

  class ICredentials {
    public:
      virtual ProtocolType getType() const noexcept = 0;
      virtual std::variant<std::string> get(const CredentialType) const = 0;

  };

} // namespace SDMS

#endif // ICREDENTIALS_HPP
