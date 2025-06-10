
#ifndef AUTHENTICATION_MANAGER_HPP
#define AUTHENTICATION_MANAGER_HPP
#pragma once

// Local includes
#include "Condition.hpp"
#include "PublicKeyTypes.hpp"

// Common includes
#include "common/IAuthenticationManager.hpp"

// Standard includes
#include <map>
#include <memory>
#include <mutex>
#include <vector>

namespace SDMS {
namespace Core {

class AuthenticationManager : public IAuthenticationManager {
private:
  // The next purge time for each type of public key
  std::map<PublicKeyType, time_t> m_next_purge;
  // The purge interval for each type of public key
  std::map<PublicKeyType, time_t> m_purge_interval;
  // The purge conditions for each type of public key
  std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>>
      m_purge_conditions;

  AuthMap m_auth_mapper;

  mutable std::mutex m_lock;

public:
  AuthenticationManager(){};

  AuthenticationManager &operator=(AuthenticationManager &&other);

  AuthenticationManager(
      std::map<PublicKeyType, time_t> purge_intervals,
      std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>>
          &&purge_conditions,
      const std::string &db_url, const std::string &db_user,
      const std::string &db_pass, const std::string &cred_dir);
  /**
   * Increments the number of times that the key has been accessed, this is used
   *by the transient key to know when it needs to be converted to a session key.
   *
   * It is used by the session key to know if it has been accesses within an
   *allotted purge time frame. If the count is above one then the session key
   *not be purged.
   **/
  virtual void incrementKeyAccessCounter(const std::string &public_key) final;

  /**
   * This will purge all keys of a particular type that have expired.
   *
   * The session key counter will be set back to 0 if it has been used and is
   *not purged.
   **/
  virtual void purge(const PublicKeyType pub_key_type) final;

  /**
   * Calls purge for both TRANSIENT and SESSION keys. If they need to be
   * purged they are.
   */
  virtual void purge() final;

  /**
   * Will return true if the public key is known is associated with a user
   *account.
   *
   * Will look at all keys:
   * - TRANSIENT
   * - SESSION
   * - PERSISTENT
   **/
  virtual bool hasKey(const std::string &pub_key) const final;

  void addKey(const PublicKeyType &pub_key_type, const std::string &public_key,
              const std::string &uid);

  /**
   * Will the id or throw an error
   *
   * Will look at all keys:
   * - TRANSIENT
   * - SESSION
   * - PERSISTENT
   **/
  virtual std::string getUID(const std::string &pub_key) const final;
};

} // namespace Core
} // namespace SDMS

#endif // AUTHENTICATION_MANAGER
