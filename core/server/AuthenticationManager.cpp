
// Local include
#include "AuthenticationManager.hpp"

// Common includes
#include "common/TraceException.hpp"

// Standard includes
#include <iostream>

namespace SDMS {
namespace Core {

AuthenticationManager::AuthenticationManager(
    std::map<PublicKeyType, time_t> purge_intervals,
    std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>>
        &&purge_conditions,
    const std::string &db_url, const std::string &db_user,
    const std::string &db_pass)
    : m_purge_interval(purge_intervals),
      m_purge_conditions(std::move(purge_conditions)),
      m_auth_mapper(m_purge_interval[PublicKeyType::TRANSIENT],
                    m_purge_interval[PublicKeyType::SESSION],
                    db_url, db_user, db_pass) {
  for (const auto &purge_int : m_purge_interval) {
    m_next_purge[purge_int.first] = time(0) + purge_int.second;
  }
}

AuthenticationManager &
AuthenticationManager::operator=(AuthenticationManager &&other) {
  // Only need to lock the mutex moving from
  if (this != &other) {
    std::lock_guard<std::mutex> lock(other.m_lock);
    m_next_purge = other.m_next_purge;
    m_purge_interval = other.m_purge_interval;
    m_purge_conditions = std::move(other.m_purge_conditions);
    m_auth_mapper = std::move(other.m_auth_mapper);
  }
  return *this;
}

void AuthenticationManager::purge() {
  purge(PublicKeyType::TRANSIENT);
  purge(PublicKeyType::SESSION);
}

void AuthenticationManager::purge(const PublicKeyType pub_key_type) {

  std::lock_guard<std::mutex> lock(m_lock);
  if (m_auth_mapper.size(pub_key_type)) {
    const time_t now = time(0);
    if (now >= m_next_purge[pub_key_type]) {
      const std::vector<std::string> expired_keys =
          m_auth_mapper.getExpiredKeys(pub_key_type, now);
      for (const auto &pub_key : expired_keys) {
        if (m_purge_conditions[pub_key_type].size()) {
          for (std::unique_ptr<Condition> &condition :
               m_purge_conditions[pub_key_type]) {
            condition->enforce(m_auth_mapper, pub_key);
          }
        } else {
          m_auth_mapper.removeKey(pub_key_type, pub_key);
        }
      }
      m_next_purge[pub_key_type] = now + m_purge_interval[pub_key_type];
    }
  }
}

void AuthenticationManager::incrementKeyAccessCounter(
    const std::string &public_key) {
  std::lock_guard<std::mutex> lock(m_lock);
  if (m_auth_mapper.hasKey(PublicKeyType::TRANSIENT, public_key)) {
    m_auth_mapper.incrementKeyAccessCounter(PublicKeyType::TRANSIENT,
                                            public_key);
  } else if (m_auth_mapper.hasKey(PublicKeyType::SESSION, public_key)) {
    m_auth_mapper.incrementKeyAccessCounter(PublicKeyType::SESSION, public_key);
  }
  // Ignore persistent cases because counter does nothing for them
}

bool AuthenticationManager::hasKey(const std::string &public_key) const {
  std::lock_guard<std::mutex> lock(m_lock);
  
  if (m_auth_mapper.hasKey(PublicKeyType::TRANSIENT, public_key)) {
    return true;
  }
  
  if (m_auth_mapper.hasKey(PublicKeyType::SESSION, public_key)) {
    return true;
  }
  
  if (m_auth_mapper.hasKey(PublicKeyType::PERSISTENT, public_key)) {
    return true;
  }
  
  return false;
}

std::string AuthenticationManager::getUID(const std::string &public_key) const {
  std::lock_guard<std::mutex> lock(m_lock);

  if (m_auth_mapper.hasKey(PublicKeyType::TRANSIENT, public_key)) {
    return m_auth_mapper.getUID(PublicKeyType::TRANSIENT, public_key);
  }
  if (m_auth_mapper.hasKey(PublicKeyType::SESSION, public_key)) {
    return m_auth_mapper.getUID(PublicKeyType::SESSION, public_key);
  }
  if (m_auth_mapper.hasKey(PublicKeyType::PERSISTENT, public_key)) {
    return m_auth_mapper.getUID(PublicKeyType::PERSISTENT, public_key);
  }
  
  EXCEPT(1, "Unrecognized public_key during execution of getUID.");
}

void AuthenticationManager::addKey(const PublicKeyType &pub_key_type,
                                   const std::string &public_key,
                                   const std::string &uid) {
  std::lock_guard<std::mutex> lock(m_lock);
  m_auth_mapper.addKey(pub_key_type, public_key, uid);
}

bool AuthenticationManager::hasKey(const PublicKeyType &pub_key_type,
                                   const std::string &public_key) const {
  std::lock_guard<std::mutex> lock(m_lock);
  return m_auth_mapper.hasKey(pub_key_type, public_key);
}

void AuthenticationManager::migrateKey(const PublicKeyType &from_type,
                                       const PublicKeyType &to_type,
                                       const std::string &public_key,
                                       const std::string &uid) {
  std::lock_guard<std::mutex> lock(m_lock);
  m_auth_mapper.migrateKey(from_type, to_type, public_key, uid);
}

void AuthenticationManager::clearTransientKeys() {
  std::lock_guard<std::mutex> lock(m_lock);
  m_auth_mapper.clearTransientKeys();
}

void AuthenticationManager::clearSessionKeys() {
  std::lock_guard<std::mutex> lock(m_lock);
  m_auth_mapper.clearSessionKeys();
}

void AuthenticationManager::clearAllNonPersistentKeys() {
  std::lock_guard<std::mutex> lock(m_lock);
  m_auth_mapper.clearAllNonPersistentKeys();
}

std::string AuthenticationManager::getUIDSafe(const std::string &public_key) const {
  std::lock_guard<std::mutex> lock(m_lock);
  
  // Try each key type in order
  std::string uid = m_auth_mapper.getUIDSafe(PublicKeyType::TRANSIENT, public_key);
  if (!uid.empty()) {
    return uid;
  }
  
  uid = m_auth_mapper.getUIDSafe(PublicKeyType::SESSION, public_key);
  if (!uid.empty()) {
    return uid;
  }
  
  uid = m_auth_mapper.getUIDSafe(PublicKeyType::PERSISTENT, public_key);
  if (!uid.empty()) {
    return uid;
  }
  
  return "";  // Return empty string if not found anywhere
}

} // namespace Core
} // namespace SDMS
