// Local private DataFed includes
#include "basic.hpp"

// Public DataFed includes
#include "ErrorCodes.hpp"
#include "TraceException.hpp"

// Standard includes
#include <string>

namespace datafed {

  bool Basic::supported(const CredentialAttribute) const {
    for( const auto & supported_cred : supportedCredentialAttributes() ) {
      if ( cred_type == supported_cred ) return true;
    }
    return false;
  }

  void Basic::add(const CredentialAttribute cred_type, const std::string & value) {
    if( supported(cred_type) ) {
      if( cred_type == CredentialAttribute::PASSWORD ) {
        m_password = value;
      } else if( cred_type == CredentialAttribute::USERNAME ) {
        m_username = value;
      }
    } else {
      EXCEPT(EC_INTERNAL_ERROR, "Cannot add CredentialAttribute to Basic Credential");
    }
  }

  const std::string & Basic::get(const SecurityType &) const {
    if( supported(cred_type) ) {
      if( cred_type == CredentialAttribute::PASSWORD ) {
        return m_password;
      } else if( cred_type == CredentialAttribute::USERNAME ) {
        return m_username;
      }
    } else {
      EXCEPT(EC_INTERNAL_ERROR, "Cannot get CredentialAttribute this attribute is not supported for Basic Credential.");
    }
  }

  const std::vector<CredentialAttribute> Basic::supportedCredentialAttributes() const {
    return std::vector<CredentialAttribute> {
      CredentialAttribute::USERNAME, 
      CredentialAttribute::PASSWORD
    };
  }
}
