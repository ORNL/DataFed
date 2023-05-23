
// Common public includes
#include "common/KeyGenerator.hpp"
#include "common/TraceException.hpp"

// Third party includes
#include <zmq.hpp>

// Standard includes
#include <iostream>

namespace SDMS {

std::unordered_map<CredentialType, std::string>
KeyGenerator::generate(const ProtocolType protocol_type,
                       const KeyType key_type) {
  if (ProtocolType::ZQTP == protocol_type) {
    if (KeyType::PUBLIC_PRIVATE == key_type) {
      char pub_key[41];
      char priv_key[41];
      if (zmq_curve_keypair(pub_key, priv_key) != 0) {
        EXCEPT_PARAM(
            1, "ZMQ security key generation failed: " << zmq_strerror(errno));
      }
      std::unordered_map<CredentialType, std::string> keys;
      keys[CredentialType::PUBLIC_KEY] = std::string(pub_key);
      keys[CredentialType::PRIVATE_KEY] = std::string(priv_key);
      return keys;
    }
  }
  EXCEPT(1, "Unsupported key generation request.");
}

bool KeyPairValidator::validate(const std::string &public_key,
                                const std::string &prviate_key) const {
  /*zmq::context_t context(5);
  zmq::socket_t socket(context, zmq::socket_type::pair);
  socket.setsockopt(ZMQ_CURVE_SERVER, 1);
  socket.setsockopt(ZMQ_CURVE_SECRETKEY, private_key);
  socket.setsockopt(ZMQ_CURVE_PUBLICKEY, public_key);*/
  /*if( !zmq_curve_publickey_valid(public_key.c_str(), private_key.c_str())){
    return false;
  }*/
  return true;
}
} // namespace SDMS
