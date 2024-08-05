
// Local private includes
#include "credentials/ZeroMQSocketCredentials.hpp"
#include "credentials/HTTPCredentials.hpp"

// Local public includes
#include "common/CredentialFactory.hpp"

// Standard includes
#include <memory>

namespace SDMS {

std::unique_ptr<ICredentials> CredentialFactory::create(
    const ProtocolType protocol_type,
    const std::unordered_map<CredentialType, std::string> &options) const {

  if (protocol_type == ProtocolType::ZQTP) {
    return std::unique_ptr<ICredentials>(new ZeroMQSocketCredentials(options));
  }

  else if (protocol_type == ProtocolType::HTTP) {
    return std::unique_ptr<ICredentials>(new HTTPCredentials(options));
  }

  return std::unique_ptr<ICredentials>();
}

} // namespace SDMS
