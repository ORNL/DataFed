//Local private includes
#include "HTTPCredentials.hpp"

//Local public includes
#include "common/TraceException.hpp"

namespace SDMS {

void HTTPCredentials::validate() {
  if (m_public_key) {
    if (m_public_key->size() != 40) {
      EXCEPT_PARAM(1, "HTTP Curve public key must have exactly 40 chars, the "
                      "provided key has: "
                          << m_public_key->size());
    }
  }
  if (m_private_key) {
    if (m_private_key->size() != 40) {
      EXCEPT_PARAM(1, "HTTP Curve private key must have exactly 40 chars, the "
                      "provided key has: "
                          << m_private_key->size());
    }
  }
  if (m_server_key) {
    if (m_server_key->size() != 40) {
      EXCEPT_PARAM(1, "HTTP Curve server key must have exactly 40 chars, the "
                      "provided key has: "
                          << m_server_key->size());
    }
  }
}

HTTPCredentials::HTTPCredentials(const std::unordered_map<CredentialType, std::string> &keys) {
  if (keys.count(CredentialType::PRIVATE_KEY)) {
    m_private_key = keys.at(CredentialType::PRIVATE_KEY);
  }
  if (keys.count(CredentialType::PUBLIC_KEY)) {
    m_public_key = keys.at(CredentialType::PUBLIC_KEY);
  }
  if (keys.count(CredentialType::SERVER_KEY)) {
    m_server_key = keys.at(CredentialType::SERVER_KEY);
  };
  validate();
}
//THIS MAY NOT NEED TO EXIST DUE TO IT BEING SOCKET CREDS
HTTPCredentials::HTTPCredentials(const std::string &public_key, const std::string &private_key, const std::string &server_key) : m_public_key(public_key), m_private_key(private_key), m_server_key(server_key) {
  validate();
}

std::string HTTPCredentials::get(const CredentialType credential_type) const {
  if (credential_type == CredentialType::PUBLIC_KEY) {
    if (m_public_key) {
      return *m_public_key;
    }
    EXCEPT(
        1,
        "Cannot grab public key from HTTP socket credentials it is not defined");
  } else if (credential_type == CredentialType::PRIVATE_KEY) {
    if (m_private_key) {
      return *m_private_key;
    }
    EXCEPT(1, "Cannot grab private key from HTTP socket credentials it is not "
              "defined");
  } else if (credential_type == CredentialType::SERVER_KEY) {
    if (m_server_key) {
      return *m_server_key;
    }
    EXCEPT(
        1,
        "Cannot grab server key from HTTP socket credentials it is not defined");
  }
  EXCEPT(1, "Error unsupported credential_type encountered");
}

} // namespace SDMS
