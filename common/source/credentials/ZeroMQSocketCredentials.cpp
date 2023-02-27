// Local private includes
#include "ZeroMQSocketCredentials.hpp"

// Local public includes
#include "TraceException.hpp"

// Standard includes
#include <variant>

namespace SDMS {

std::variant<std::string> ZeroMQSocketCredentials::get(const CredentialType credential_type) const {
  if ( credential_type == CredentialType::PUBLIC_KEY ) {
    return m_public_key;
  } else if( credential_type == CredentialType::PRIVATE_KEY ) {
    return m_private_key;
  } else if( credential_type == CredentialType::SERVER_KEY ) {
    return m_server_key;
  }
  EXCEPT(1, "Error unsupported credential_type encountered"); 
}

} // namespace SDMS
