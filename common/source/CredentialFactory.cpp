
// Local private includes
#include "credentials/ZeroMQSocketCredentials.hpp"

// Local public includes
#include "CredentialFactory.hpp"

// Standard includes
#include <memory>

namespace SDMS {

  std::unique_ptr<ICredentials> CredentialFactory::create(
      const ProtocolType protocol_type,
      const std::unordered_map<CredentialType, std::variant<std::string>> & options
      ) const {

    if(protocol_type == ProtocolType::ZQTP ) {
      std::string pub_key = std::get<std::string>(options.at(CredentialType::PUBLIC_KEY));
      std::string priv_key = std::get<std::string>(options.at(CredentialType::PRIVATE_KEY));
      std::string serv_key = std::get<std::string>(options.at(CredentialType::SERVER_KEY));
      return std::unique_ptr<ICredentials>(new ZeroMQSocketCredentials(pub_key, priv_key, serv_key));
    }
    return std::unique_ptr<ICredentials>();
  }

} // namespace SDMS
