#include "Condition.hpp"

// Standard includes
#include <iostream>

namespace SDMS {
  namespace Core {  

    void Promote::enforce(AuthMap & auth_map, const std::string & public_key) {
      std::cout << "Executing promote condition" << std::endl;
      if( auth_map.hasKeyType(m_promote_from, public_key) ) {
        size_t access_count = auth_map.getAccessCount(m_promote_from, public_key);
        if ( access_count >= m_transient_to_session_count_threshold ) {
          std::cout << __FILE__ << " Creating Session key: " << public_key << " count is " << access_count << std::endl;
          // Convert transient key to session key if has been accessed more than the threshold
          std::string uid = auth_map.getUID(m_promote_from, public_key);
          auth_map.addKey(m_promote_to, public_key, uid); 
        }
        // Remove expired short lived transient key
        std::cout << __FILE__ << " Purging transient key: " << public_key << " count is " << access_count << std::endl;
        auth_map.removeKey(m_promote_from, public_key);
      }
    }

    void Reset::enforce(AuthMap & auth_map, const std::string & public_key) {
      std::cout << "Executing reset condition" << std::endl;
      if ( auth_map.hasKeyType(m_act_on_key_type, public_key) ) {
        size_t access_count = auth_map.getAccessCount(m_act_on_key_type, public_key);
        if( access_count >= m_access_attempts ) {
          // If the session key has been accessed within the threshold then reset the active period
          std::cout << __FILE__ << " resetting session key: " << public_key << " count is " << access_count << std::endl;
          auth_map.resetKey(m_act_on_key_type, public_key);
        } else {
          // If the key has not been used then remove it.
          std::cout << __FILE__ << " Purging session key: " << public_key << " count is " << access_count << std::endl;
          auth_map.removeKey(m_act_on_key_type, public_key);
        }
      }
    }

  } // Core
} // SDMS
