
// Common public includes
#include "KeyGenerator.hpp"
#include "TraceException.hpp"

// Third party includes
#include <zmq.hpp>

namespace SDMS {

  std::unordered_map<CredentialType, std::string> KeyGenerator::generate(const ProtocolType protocol_type, const KeyType key_type) {
    if(ProtocolType::ZQTP == protocol_type){
      if(KeyType::PUBLIC_PRIVATE == key_type){
        char pub_key[41];
        char priv_key[41];
        if ( zmq_curve_keypair( pub_key, priv_key ) != 0 ) {
          EXCEPT_PARAM( 1, "ZMQ security key generation failed: " << zmq_strerror( errno ));
        }
        std::unordered_map<CredentialType, std::string> keys;
        keys[CredentialType::PUBLIC_KEY] = std::string(pub_key);
        keys[CredentialType::PRIVATE_KEY] = std::string(priv_key);
        return keys;
      }
    }
    EXCEPT( 1, "Unsupported key generation request.");
  }

} // namespace SDMS

