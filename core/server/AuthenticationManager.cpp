
// Local include
#include "AuthenticationManager.hpp"

// Common includes
#include "TraceException.hpp"

// Standard includes
#include <iostream>

namespace SDMS {
  namespace Core {

    AuthenticationManager::AuthenticationManager(
        std::map<PublicKeyType, time_t> purge_intervals,
        std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>> && purge_conditions,
        const std::string & db_url,
        const std::string & db_user,
        const std::string & db_pass) : 
      m_purge_interval(purge_intervals),
      m_purge_conditions(std::move(purge_conditions)) {
      std::cout << __FILE__ << " Creating AuthMap with url: " << db_url << " user: " << db_user << " pass: " << db_pass << std::endl;
      m_auth_mapper = std::move(AuthMap(
        m_purge_interval[PublicKeyType::TRANSIENT],
        m_purge_interval[PublicKeyType::SESSION],
        db_url,
        db_user,
        db_pass));

        for ( const auto & purge_int : m_purge_interval ) {
          m_next_purge[purge_int.first] = time(0) + purge_int.second;
        }
      }



    void AuthenticationManager::purge(
        const PublicKeyType pub_key_type) {

      std::cout << "CHecking size of AuthMap: " << m_auth_mapper.size(pub_key_type) << std::endl;
      if( m_auth_mapper.size( pub_key_type ) ) {
        const time_t now = time( 0 );
        std::cout << "Maybe purge now: " << now << " next_purge is " << m_next_purge[pub_key_type] << std::endl;
        if ( now >= m_next_purge[pub_key_type] ) {
          const std::vector<std::string> expired_keys = m_auth_mapper.getExpiredKeys(pub_key_type, now);
          for ( const auto & pub_key : expired_keys ) {
            std::cout << "Expired key found " << pub_key << std::endl;
            if( m_purge_conditions[pub_key_type].size() ) {
              for ( std::unique_ptr<Condition> & condition : m_purge_conditions[pub_key_type] ) {
                std::cout << "Running Condition" << std::endl;
                condition->enforce(m_auth_mapper, pub_key); 
              }
            } else {
              std::cout << "Should remove key now " << pub_key << std::endl;
              m_auth_mapper.removeKey(pub_key_type, pub_key);
            }
          }
          m_next_purge[pub_key_type] = now + m_purge_interval[pub_key_type];
        }
      }
    }

    void AuthenticationManager::incrementKeyAccessCounter(const std::string & public_key) {
      if ( m_auth_mapper.hasKey(PublicKeyType::TRANSIENT, public_key) ) {
        m_auth_mapper.incrementKeyAccessCounter(PublicKeyType::TRANSIENT, public_key);
      } else if (m_auth_mapper.hasKey(PublicKeyType::SESSION, public_key) ) {
        m_auth_mapper.incrementKeyAccessCounter(PublicKeyType::SESSION, public_key);
      }
      // Ignore persistent cases because counter does nothing for them
    }

    bool
      AuthenticationManager::hasKey(const std::string & public_key ) const {
        if( m_auth_mapper.hasKey(PublicKeyType::TRANSIENT, public_key) ) {
          std::cout << "has key TRANSIENT true" << std::endl;
          return true;
        } else if( m_auth_mapper.hasKey(PublicKeyType::SESSION, public_key) ) {
          std::cout << "has key SESSION true" << std::endl;
          return true;
        } else if( m_auth_mapper.hasKey(PublicKeyType::PERSISTENT, public_key) ) {
          std::cout << "has key PERSISTENT true" << std::endl;
          return true;
        }
        return false;
      }

    std::string
      AuthenticationManager::getUID(const std::string & public_key ) const {

        if( m_auth_mapper.hasKey(PublicKeyType::TRANSIENT, public_key) ) return m_auth_mapper.getUID(PublicKeyType::TRANSIENT, public_key);
        if( m_auth_mapper.hasKey(PublicKeyType::SESSION, public_key) ) return m_auth_mapper.getUID(PublicKeyType::SESSION, public_key);
        if( m_auth_mapper.hasKey(PublicKeyType::PERSISTENT, public_key) ) return m_auth_mapper.getUID(PublicKeyType::PERSISTENT, public_key);
        EXCEPT( 1, "Unrecognized public_key during execution of getUID." );
      }


    void AuthenticationManager::addKey(const PublicKeyType pub_key_type, const std::string public_key, const std::string uid) {
      m_auth_mapper.addKey(pub_key_type, public_key, uid);
    }

  } // Core
} // SDMS
