#ifndef DATAFED_CORE_CREDENTIAL_HPP
#define DATAFED_CORE_CREDENTIAL_HPP
#pragma once

// Standard includes
#include <string>
#include <vector>

namespace datafed {

  enum class CredentialType {
    Basic,
    Bearer
  };

  enum class CredentialAttribute {
    USERNAME,
    PASSWORD,
    TOKEN,
    REFRESH_TOKEN
  };

  class Credential {
    public:
      virtual CredentialType type() const noexcept = 0;
      virtual void add(const CredentialAttribute, const std::string & ) = 0;
      virtual const std::string & get(const CredentialAttribute) const = 0;
      virtual const std::vector<CredentialAttribute> supportedCredentialAttributes() const noexcept = 0;
      virtual bool supported(const CredentialAttribute) const = 0;
  };
}
#endif // DATAFED_CORE_CREDENTIAL_HPP
