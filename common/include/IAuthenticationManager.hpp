
#ifndef IAUTHENTICATION_MANAGER_HPP
#define IAUTHENTICATION_MANAGER_HPP
#pragma once

// Standard imports
#include <string>

/**
 * Interface class for managing authenticating
 *
 * Deals with public keys, keys are only stored in the AuthenticationManager once they have been authenticated and mapped with a user account..
 *
 * Transient keys - are only available for a short period of time after the key has been authenticated.
 * Session keys - these should be valid as long as the user is using the session and will expire after
 * an allotted time.
 * Persistent keys - these are stored in the database and consist of repositoriy public keys and
 * user public keys. 
 **/
class IAuthenticationManager
{
public:
    /** 
     * Increments the number of times that the key has been accessed, this is used by the transient key to 
     * know when it needs to be converted to a session key.
     *
     * It is used by the session key to know if it has been accesses within an allotted purge time frame.
     * If the count is above one then the session key not be purged.
     **/
    virtual void incrementKeyAccessCounter(const std::string & public_key) = 0;

    /**
     * Will return true if the public key is known is associated with a user account.
     *
     * Will look at all keys:
     * - TRANSIENT
     * - SESSION
     * - PERSISTENT
     **/
    virtual bool hasKey(const std::string & pub_key) const = 0;

    /**
     * Will the id or throw an error
     *
     * Will look at all keys:
     * - TRANSIENT
     * - SESSION
     * - PERSISTENT
     **/
    virtual std::string getUID(const std::string & pub_key) const = 0;
};


#endif // IAUTHENTICATION_MANAGER
