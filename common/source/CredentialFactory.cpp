
// Local private includes
#include "credentials/ZeroMQSocketCredentials.hpp"

// Local public includes
#include "common/CredentialFactory.hpp"

// Standard includes
#include <memory>

namespace SDMS {

  std::unique_ptr<ICredentials> CredentialFactory::create(
      const ProtocolType protocol_type,
      const std::unordered_map<CredentialType, std::string> & options
      ) const {

    if(protocol_type == ProtocolType::ZQTP ) {
      return std::unique_ptr<ICredentials>(new ZeroMQSocketCredentials(options));
    }
    return std::unique_ptr<ICredentials>();
  }

} // namespace SDMS
