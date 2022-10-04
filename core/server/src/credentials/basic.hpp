#ifndef DATAFED_CORE_CREDENTIAL_BASIC_HPP
#define DATAFED_CORE_CREDENTIAL_BASIC_HPP
#pragma once

// Local private DataFed includes
#include "credential.hpp"

// Standard includes
#include <string>

namespace datafed {

  class Basic : public Credential {
      std::string m_username;
      std::string m_password;
    public:
      virtual CredentialType type() const noexcept final { return CredentialType::Basic; }
      virtual void add(const CredentialAttribute, const std::string & ) final;
      virtual const std::string & get(const CredentialAttribute) const final;
      virtual const std::vector<CredentialAttribute> supportedCredentialAttributes() const noexcept final;
      virtual bool supported(const CredentialAttribute) const noexcept final;
  };
}
#endif // DATAFED_CORE_CREDENTIAL_BASIC_HPP
