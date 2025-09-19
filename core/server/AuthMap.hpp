#ifndef IDENTITYMAP_HPP
#define IDENTITYMAP_HPP
#pragma once

// Local includes
#include "AuthMap.hpp"
#include "PublicKeyTypes.hpp"

// Local common includes
#include "common/IAuthenticationManager.hpp"

// Standard includes
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace SDMS {
namespace Core {

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

  std::string m_db_url;
  std::string m_db_user;
  std::string m_db_pass;

public:
  AuthMap(){};

  AuthMap(time_t trans_active_inc, time_t session_active_inc,
          const std::string &db_url, const std::string &db_user,
          const std::string &db_pass)
      : m_trans_active_increment(trans_active_inc),
        m_session_active_increment(session_active_inc), m_db_url(db_url),
        m_db_user(db_user), m_db_pass(db_pass){};

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
   * Set the access count on a key.
   **/
  void setAccessCount(const PublicKeyType pub_key_type,
                      const std::string &public_key,
                      const size_t);

  /**
   * Will return the users Unique ID if it exists, will throw an error if it
   *does not exist. Best to call hasKey first.
   **/
  std::string getUID(const PublicKeyType pub_key_type,
                     const std::string &public_key) const;
  
  /**
   * Safe version that returns empty string if key not found
   **/
  std::string getUIDSafe(const PublicKeyType pub_key_type,
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
   * @brief Migrates an authentication key from one storage type to another.
   *
   * This method supports migrating keys between specific `PublicKeyType`s:
   * - TRANSIENT -> SESSION
   * - SESSION   -> PERSISTENT
   *
   * This is useful for correcting misclassified keys (e.g., when a repository
   * key was incorrectly cached as transient/session during DB outage).
   *
   * The migration process ensures:
   *  - The source key exists before attempting removal.
   *  - The destination key does not exist before insertion.
   *  - Appropriate locks are taken to ensure thread safety.
   *
   * @param from_type   The original type of the key (TRANSIENT or SESSION).
   * @param to_type     The target type of the key (SESSION or PERSISTENT).
   * @param public_key  The public key to be migrated.
   * @param id          The identifier associated with the key.
   *
   * @throws Exception if:
   *   - Migration is not supported.
   *   - The source key is missing.
   *   - Any internal invariant fails during migration.
   **/
  void migrateKey(const PublicKeyType from_type,
                  const PublicKeyType to_type,
                  const std::string &public_key,
                  const std::string &id);

  /**
   * Will reset the access counter of the key to 0 and the allowed expiration
   *time of the key..
   *
   * Persistent keys are not supported with this function.
   **/
  void resetKey(const PublicKeyType pub_key_type,
                const std::string &public_key);

  /**
   * Clear all transient keys from the authentication map.
   * This is useful for cleaning up stale keys after service restarts.
   **/
  void clearTransientKeys();

  /**
   * Clear all session keys from the authentication map.
   * This is useful for cleaning up stale keys after service restarts.
   **/
  void clearSessionKeys();

  /**
   * Clear all non-persistent (transient and session) keys.
   * Persistent keys are preserved as they represent service accounts.
   **/
  void clearAllNonPersistentKeys();
};

} // namespace Core
} // namespace SDMS
#endif // IDENTITYMAP
