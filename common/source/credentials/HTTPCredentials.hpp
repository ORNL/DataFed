#ifndef HTTP_CREDENTIALS_HPP
#define HTTP_CREDENTIALS_HPP
 
//Local includes
#include "common/ICredentials.hpp"
#include "common/ProtocolTypes.hpp"

//Standard includes
#include <optional>
#include <string>
#include <unordered_map>

namespace SDMS {

class HTTPCredentials : public ICredentials {
private:
  std::optional<std::string> m_public_key;
  std::optional<std::string> m_private_key;
  std::optional<std::string> m_server_key;
  
  void validate();

public:
  HTTPCredentials() = default;

  HTTPCredentials(
      const std::unordered_map<CredentialType, std::string> &);

  HTTPCredentials(const std::string &public_key, const std::string &private_key, const std::string &server_key);

  virtual ProtocolType getType() const noexcept final {
    return ProtocolType::HTTP;
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

#endif //HTTPCredentials_HPP
