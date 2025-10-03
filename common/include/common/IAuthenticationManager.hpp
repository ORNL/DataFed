
#ifndef IAUTHENTICATION_MANAGER_HPP
#define IAUTHENTICATION_MANAGER_HPP
#pragma once

// Standard imports
#include <string>

namespace SDMS {

/**
 * Interface class for managing authenticating
 *
 * Deals with public keys, keys are only stored in the AuthenticationManager
 *once they have been authenticated and mapped with a user account..
 *
 * Transient keys - are only available for a short period of time after the key
 *has been authenticated. Session keys - these should be valid as long as the
 *user is using the session and will expire after an allotted time. Persistent
 *keys - these are stored in the database and consist of repositoriy public keys
 *and user public keys.
 **/
class IAuthenticationManager {
public:
  /**
   * Increments the number of times that the key has been accessed, this is
   *useful information when deciding if a key should be purged.
   **/
  virtual void incrementKeyAccessCounter(const std::string &public_key) = 0;

  /**
   * Will return true if the public key is known. This is also dependent on the
   *the ability of the AuthenticationManager to connect with the database, it
   *will return false if the public key is only on the database and it cannot
   *connect to it.
   *
   * Will look at all keys:
   * - TRANSIENT
   * - SESSION
   * - PERSISTENT
   **/
  virtual bool hasKey(const std::string &pub_key) const = 0;

  /**
   * Will get the unique id or throw an error
   *
   * Will look at all keys:
   * - TRANSIENT
   * - SESSION
   * - PERSISTENT - user or repo
   **/
  virtual std::string getUID(const std::string &pub_key) const = 0;

  /**
   * Purge keys if needed
   **/
  virtual void purge() = 0;

  virtual ~IAuthenticationManager() {};
};

} // namespace SDMS

#endif // IAUTHENTICATION_MANAGER
