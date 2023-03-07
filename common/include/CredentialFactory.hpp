#ifndef CREDENTIAL_FACTORY_HPP
#define CREDENTIAL_FACTORY_HPP
#pragma once

// Local public includes
#include "ICredentials.hpp"
#include "ProtocolTypes.hpp"

// Standard includes
#include <memory>
#include <unordered_map>

namespace SDMS {

class CredentialFactory {
  public:
    std::unique_ptr<ICredentials> create(
        const ProtocolType,
        const std::unordered_map<CredentialType, std::string> & options) const;
};

} // namespace SDMS

#endif // CREDENTIAL_FACTORY_HPP
