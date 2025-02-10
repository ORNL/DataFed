#ifndef IDENTITYMAP_HPP
#define IDENTITYMAP_HPP
#pragma once

// Local includes
#include "PublicKeyTypes.hpp"

// Local common includes
#include "common/IAuthenticationManager.hpp"

// Standard includes
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace SDMS {
namespace MockCore {

class AuthMap {
public:
  struct AuthElement {
    std::string uid = "";
    time_t expiration_time = 0;
    size_t access_count = 0;
  };

  typedef std::map<std::string, AuthElement> client_map_t;
  typedef std::map<std::string, std::string> persistent_client_map_t;

private:
  time_t m_trans_active_increment = 0;
  time_t m_session_active_increment = 0;

  mutable std::mutex
      m_trans_clients_mtx; ///< Mutex for transient client data access
  mutable std::mutex
      m_session_clients_mtx; ///< Mutex for session client data access
  mutable std::mutex
      m_persistent_clients_mtx; ///< Mutex for persistent client data access

  client_map_t m_trans_auth_clients; ///< Map of transient authenticated clients
  client_map_t m_session_auth_clients; ///< Map of session authenticated clients
  persistent_client_map_t
      m_persistent_auth_clients; ///< Map of known persistent authenticated
                                 ///< clients

public:
  AuthMap(){};

  AuthMap(time_t trans_active_inc, time_t session_active_inc)
      : m_trans_active_increment(trans_active_inc),
        m_session_active_increment(session_active_inc){};

  AuthMap(const AuthMap &);

  AuthMap &operator=(const AuthMap &&);
  /***********************************************************************************
   * Getters
   ***********************************************************************************/

  /**
   * Determines if the key has the specified type
   *
   * There are 3 supported types:
   * 1. TRANSIENT
   * 2. SESSION
   * 3. PERSISTENT
   *
   * Will return true if the public key does have the type, if the type is a
   *user persistent type it will return true if it can verify with the database,
   *if the database in unreachable it will return false.
   **/
  bool hasKeyType(const PublicKeyType pub_key_type,
                  const std::string &public_key) const;

  /**
   * Will grab all the public keys that have expired.
   **/
  std::vector<std::string>
  getExpiredKeys(const PublicKeyType pub_key_type,
                 const time_t threshold) const noexcept;

  /**
   * Return how many times the key has been accessed since the count was last
   *reset.
   **/
  size_t getAccessCount(const PublicKeyType pub_key_type,
                        const std::string &public_key) const;

  /**
   * Will return the users Unique ID if it exists, will throw an error if it
   *does not exist. Best to call hasKey first.
   **/
  std::string getUID(const PublicKeyType pub_key_type,
                     const std::string &public_key) const;

  /**
   * Will return the number of keys of the provided type. Does not currently
   *support the Persistent keys
   **/
  size_t size(const PublicKeyType pub_key_type) const;

  bool hasKey(const PublicKeyType pub_key_type,
              const std::string &public_key) const;

  /***********************************************************************************
   * Manipulators
   ***********************************************************************************/

  /**
   * Increase the recorded times the the public key has been accessed by one.
   **/
  void incrementKeyAccessCounter(const PublicKeyType pub_key_type,
                                 const std::string &public_key);

  /**
   * Adds the key to the AuthMap object
   *
   * Example
   *
   * ```c++
   * AuthMap auth_map(30,60*60, "https://db_/api_/sdms/..blah", "henry", "42");
   * auth_map.addKey(PublicKeyType::TRANSIENT, "243djgq349j08xd24393#",
   *"u/henry");
   * ```
   **/
  void addKey(const PublicKeyType pub_key_type, const std::string &public_key,
              const std::string &id);

  void removeKey(const PublicKeyType pub_key_type,
                 const std::string &public_key);

  /**
   * Will reset the access counter of the key to 0 and the allowed expiration
   *time of the key..
   *
   * Persistent keys are not supported with this function.
   **/
  void resetKey(const PublicKeyType pub_key_type,
                const std::string &public_key);
};

} // namespace MockCore
} // namespace SDMS
#endif // IDENTITYMAP
