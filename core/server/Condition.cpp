
// Local private includes
#include "Condition.hpp"

// Standard includes
#include <iostream>

namespace SDMS {
namespace Core {

void Promote::enforce(AuthMap &auth_map, const std::string &public_key) {
  if (auth_map.hasKeyType(m_promote_from, public_key)) {
    size_t access_count = auth_map.getAccessCount(m_promote_from, public_key);
    if (access_count >= m_transient_to_session_count_threshold) {
      // Convert transient key to session key if has been accessed more than the
      // threshold
      std::string uid = auth_map.getUID(m_promote_from, public_key);
      std::cout << "PROMOTE: access_count: " << access_count
                << " Promoting uid to SESSION KEY " << uid << " public key is "
                << public_key << std::endl;
      auth_map.addKey(m_promote_to, public_key, uid);
    }
    // Remove expired short lived transient key
    std::cout << "PROMOTE: access_count: " << access_count
              << " removing TRANSIENT KEY " << public_key << std::endl;
    auth_map.removeKey(m_promote_from, public_key);
  }
}

void Reset::enforce(AuthMap &auth_map, const std::string &public_key) {
  if (auth_map.hasKeyType(m_act_on_key_type, public_key)) {
    size_t access_count =
        auth_map.getAccessCount(m_act_on_key_type, public_key);
    if (access_count >= m_access_attempts) {
      // If the session key has been accessed within the threshold then reset
      // the active period
      std::cout << "RESET: access_count " << access_count << " reseting key "
                << public_key << std::endl;
      auth_map.resetKey(m_act_on_key_type, public_key);
    } else {
      // If the key has not been used then remove it.
      std::cout << "RESET: access_count " << access_count << " removing key "
                << public_key << std::endl;
      auth_map.removeKey(m_act_on_key_type, public_key);
    }
  }
}

} // namespace Core
} // namespace SDMS
