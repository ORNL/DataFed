
// Local private includes
#include "AuthMap.hpp"
#include "DatabaseAPI.hpp"

using namespace std;

namespace SDMS {

namespace Core {
AuthMap::AuthMap(const AuthMap &auth_map) {
  m_trans_active_increment = auth_map.m_trans_active_increment;
  m_session_active_increment = auth_map.m_session_active_increment;

  auth_map.m_trans_clients_mtx.lock();
  m_trans_auth_clients = auth_map.m_trans_auth_clients;
  auth_map.m_trans_clients_mtx.unlock();

  auth_map.m_session_clients_mtx.lock();
  m_session_auth_clients = auth_map.m_session_auth_clients;
  auth_map.m_session_clients_mtx.unlock();

  auth_map.m_persistent_clients_mtx.lock();
  m_persistent_auth_clients = auth_map.m_persistent_auth_clients;
  auth_map.m_persistent_clients_mtx.unlock();

  m_db_url = auth_map.m_db_url;
  m_db_user = auth_map.m_db_user;
  m_db_pass = auth_map.m_db_pass;
}

AuthMap &AuthMap::operator=(const AuthMap &&auth_map) {
  m_trans_active_increment = auth_map.m_trans_active_increment;
  m_session_active_increment = auth_map.m_session_active_increment;

  auth_map.m_trans_clients_mtx.lock();
  const auto trans = auth_map.m_trans_auth_clients;
  auth_map.m_trans_clients_mtx.unlock();

  m_trans_clients_mtx.lock();
  m_trans_auth_clients = trans;
  m_trans_clients_mtx.unlock();

  auth_map.m_session_clients_mtx.lock();
  const auto session = auth_map.m_session_auth_clients;
  auth_map.m_session_clients_mtx.unlock();

  m_session_clients_mtx.lock();
  m_session_auth_clients = session;
  m_session_clients_mtx.unlock();

  auth_map.m_persistent_clients_mtx.lock();
  const auto persistent = auth_map.m_persistent_auth_clients;
  auth_map.m_persistent_clients_mtx.unlock();

  m_persistent_clients_mtx.lock();
  m_persistent_auth_clients = persistent;
  m_persistent_clients_mtx.unlock();

  m_db_url = auth_map.m_db_url;
  m_db_user = auth_map.m_db_user;
  m_db_pass = auth_map.m_db_pass;
  return *this;
}

std::vector<std::string>
AuthMap::getExpiredKeys(const PublicKeyType pub_key_type,
                        const time_t threshold) const noexcept {

  auto expiredKeys = [=](const AuthMap::client_map_t &client_map,
                         const time_t expire_time) -> std::vector<std::string> {
    std::vector<std::string> expired_keys;
    for (const auto &element : client_map) {
      if (element.second.expiration_time >= expire_time) {
        expired_keys.push_back(element.first);
      }
    }
    return expired_keys;
  };

  if (PublicKeyType::TRANSIENT == pub_key_type) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    return expiredKeys(m_trans_auth_clients, threshold);
  } else if (PublicKeyType::SESSION == pub_key_type) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    return expiredKeys(m_session_auth_clients, threshold);
  }
  return std::vector<std::string>();
}

void AuthMap::removeKey(const PublicKeyType pub_key_type,
                        const std::string &pub_key) {

  if (PublicKeyType::TRANSIENT == pub_key_type) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    if (m_trans_auth_clients.count(pub_key)) {
      m_trans_auth_clients.erase(pub_key);
    }
  } else if (PublicKeyType::SESSION == pub_key_type) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    if (m_session_auth_clients.count(pub_key)) {
      m_session_auth_clients.erase(pub_key);
    }
  } else if (PublicKeyType::PERSISTENT == pub_key_type) {
    lock_guard<mutex> lock(m_persistent_clients_mtx);
    if (m_persistent_auth_clients.count(pub_key)) {
      m_persistent_auth_clients.erase(pub_key);
    }
  } else {
    EXCEPT(1, "Unsupported PublicKey Type during execution of removeKey.");
  }
}

void AuthMap::resetKey(const PublicKeyType pub_key_type,
                       const std::string &public_key) {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    if (m_trans_auth_clients.count(public_key)) {
      m_trans_auth_clients[public_key].expiration_time =
          time(0) + m_trans_active_increment;
      m_trans_auth_clients[public_key].access_count = 0;
    } else {
      EXCEPT(1, "Missing public key cannot reset transient expiration.");
    }
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    if (m_session_auth_clients.count(public_key)) {
      m_session_auth_clients[public_key].expiration_time =
          time(0) + m_session_active_increment;
      m_session_auth_clients[public_key].access_count = 0;
    } else {
      EXCEPT(1, "Missing public key cannot reset session expiration.");
    }
  } else {
    EXCEPT(1, "Unsupported PublicKey Type during execution of resetKey.");
  }
}

void AuthMap::addKey(const PublicKeyType pub_key_type,
                     const std::string &public_key, const std::string &id) {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    AuthElement element = {id, time(0) + m_trans_active_increment, 0};
    m_trans_auth_clients[public_key] = element;
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    AuthElement element = {id, time(0) + m_session_active_increment, 0};
    m_session_auth_clients[public_key] = element;
  } else if (pub_key_type == PublicKeyType::PERSISTENT) {
    lock_guard<mutex> lock(m_persistent_clients_mtx);
    m_persistent_auth_clients[public_key] = id;
  } else {
    EXCEPT(1, "Unsupported PublicKey Type during execution of addKey.");
  }
}

size_t AuthMap::size(const PublicKeyType pub_key_type) const {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    return m_trans_auth_clients.size();
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    return m_session_auth_clients.size();
  } else {
    // Don't support size of persistent keys
    EXCEPT(1, "Unsupported PublicKey Type during execution of size.");
  }
}

void AuthMap::incrementKeyAccessCounter(const PublicKeyType pub_key_type,
                                        const std::string &public_key) {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    if (m_trans_auth_clients.count(public_key)) {
      m_trans_auth_clients.at(public_key).access_count++;
    }
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    if (m_session_auth_clients.count(public_key)) {
      m_session_auth_clients.at(public_key).access_count++;
    }
  }
}

bool AuthMap::hasKey(const PublicKeyType pub_key_type,
                     const std::string &public_key) const {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    return m_trans_auth_clients.count(public_key) > 0;
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    return m_session_auth_clients.count(public_key) > 0;
  } else if (pub_key_type == PublicKeyType::PERSISTENT) {
    // Check to see if it is a repository key FIRST
    {
      lock_guard<mutex> lock(m_persistent_clients_mtx);
      if (m_persistent_auth_clients.count(public_key) > 0) {
        return true;
      }
    }
    
    // Only check database for user keys if not found in memory
    try {
      DatabaseAPI db(m_db_url, m_db_user, m_db_pass);
      std::string uid;
      if (db.uidByPubKey(public_key, uid)) {
        return true;
      }
    } catch (const std::exception& e) {
      // Database is down, but we already checked memory map
      // TODO: Caller should log this failure for monitoring/alerting
    }
  } else {
    EXCEPT(1, "Unrecognized PublicKey Type during execution of hasKey.");
  }
  return false;
}

std::string AuthMap::getUID(const PublicKeyType pub_key_type,
                            const std::string &public_key) const {

  std::string uid = getUIDSafe(pub_key_type, public_key);
  
  if (uid.empty()) {
    if (pub_key_type == PublicKeyType::TRANSIENT) {
      EXCEPT(1, "Missing transient public key unable to map to uid.");
    } else if (pub_key_type == PublicKeyType::SESSION) {
      EXCEPT(1, "Missing session public key unable to map to uid.");
    } else if (pub_key_type == PublicKeyType::PERSISTENT) {
      EXCEPT(1, "Missing persistent public key unable to map to user id or "
                "repo id. Possibly, cannot connect to database.");
    } else {
      EXCEPT(1, "Unrecognized PublicKey Type during execution of getId.");
    }
  }
  
  return uid;
}

std::string AuthMap::getUIDSafe(const PublicKeyType pub_key_type,
                                const std::string &public_key) const {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    if (m_trans_auth_clients.count(public_key)) {
      return m_trans_auth_clients.at(public_key).uid;
    }
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    if (m_session_auth_clients.count(public_key)) {
      return m_session_auth_clients.at(public_key).uid;
    }
  } else if (pub_key_type == PublicKeyType::PERSISTENT) {
    // Check repository keys first (with proper locking)
    {
      lock_guard<mutex> lock(m_persistent_clients_mtx);
      if (m_persistent_auth_clients.count(public_key)) {
        return m_persistent_auth_clients.at(public_key);
      }
    }
    
    // Check database for user keys
    DatabaseAPI db(m_db_url, m_db_user, m_db_pass);
    std::string uid;
    if (db.uidByPubKey(public_key, uid)) {
      return uid;
    }
  }
  
  return "";  // Return empty string instead of throwing
}

bool AuthMap::hasKeyType(const PublicKeyType pub_key_type,
                         const std::string &public_key) const {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    return m_trans_auth_clients.count(public_key);
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    return m_session_auth_clients.count(public_key);
  } else {
    EXCEPT(1, "Unsupported PublicKey Type during execution of hasKeyType.");
  }
}

void AuthMap::setAccessCount(const PublicKeyType pub_key_type,
                             const std::string &public_key,
                             const size_t count) {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    std::lock_guard<std::mutex> lock(m_trans_clients_mtx);
    if (m_trans_auth_clients.count(public_key)) {
      m_trans_auth_clients.at(public_key).access_count = count;
    }
  } else if (pub_key_type == PublicKeyType::SESSION) {
    std::lock_guard<std::mutex> lock(m_session_clients_mtx);
    if (m_session_auth_clients.count(public_key)) {
      m_session_auth_clients.at(public_key).access_count = count;
    }
  } else {
    EXCEPT(1, "Unsupported PublicKey Type during execution of setAccessCount.");
  }
}

size_t AuthMap::getAccessCount(const PublicKeyType pub_key_type,
                               const std::string &public_key) const {
  if (pub_key_type == PublicKeyType::TRANSIENT) {
    lock_guard<mutex> lock(m_trans_clients_mtx);
    if (m_trans_auth_clients.count(public_key)) {
      return m_trans_auth_clients.at(public_key).access_count;
    }
  } else if (pub_key_type == PublicKeyType::SESSION) {
    lock_guard<mutex> lock(m_session_clients_mtx);
    if (m_session_auth_clients.count(public_key)) {
      return m_session_auth_clients.at(public_key).access_count;
    }
  } else {
    EXCEPT(1, "Unsupported PublicKey Type during execution of getAccessCount.");
  }
  return 0;
}

bool isSupportedMigration(const PublicKeyType from, const PublicKeyType to) {
  // Only support the following migrations
  // TRANSIENT -> SESSION
  // SESSION -> PERSISTENT
  if ((from == PublicKeyType::TRANSIENT && to == PublicKeyType::SESSION ) ||
      (from == PublicKeyType::SESSION   && to == PublicKeyType::PERSISTENT )) {
    return true;
  }
  return false;
}

void AuthMap::migrateKey(const PublicKeyType from_type,
                        const PublicKeyType to_type,
                        const std::string &public_key,
                        const std::string &id) {

  if( from_type == to_type ) {
    return;
  }

  if ( ! isSupportedMigration(from_type, to_type) ) {
    EXCEPT(1, "Unsupported key migration attempted, only allowed to migrate to TRANSIENT -> SESSION or SESSION -> PERSISTENT");
  }

  if (from_type == PublicKeyType::TRANSIENT) {
    // TRANSIENT -> SESSION
    std::lock_guard<std::mutex> lock_trans(m_trans_clients_mtx);
    // Make sure TRANSIENT key exists before trying to remove it.
    if (! m_trans_auth_clients.count(public_key)) {
      EXCEPT(1, "Missing TRANSIENT key, unable to migrate key (TRANSIENT->SESSION)!");
    }
    std::lock_guard<std::mutex> lock_sess(m_session_clients_mtx);
    m_trans_auth_clients.erase(public_key);
    // Make sure SESSION key does not exist before trying to add it.
    if ( m_session_auth_clients.count(public_key) == 0 ) {
      AuthElement element = {id, time(0) + m_trans_active_increment, 0};
      m_session_auth_clients[public_key] = element;
    }

  } else if (from_type == PublicKeyType::SESSION) {
    // SESSION -> PERSISTENT
    std::lock_guard<std::mutex> lock_sess(m_session_clients_mtx);
    // Make sure SESSION key exists before trying to remove it.
    if (! m_session_auth_clients.count(public_key)) {
      EXCEPT(1, "Missing SESSION key, unable to migrate key (SESSION->PERSISTENT)!");
    }
    std::lock_guard<std::mutex> lock_pers(m_persistent_clients_mtx);
    m_session_auth_clients.erase(public_key);
    // Make sure PERSISTENT key does not exist before trying to add it.
    if ( m_persistent_auth_clients.count(public_key) == 0 ) {
      m_persistent_auth_clients[public_key] = id;
    }
  }
}

void AuthMap::clearTransientKeys() {
  std::lock_guard<std::mutex> lock(m_trans_clients_mtx);
  m_trans_auth_clients.clear();
}

void AuthMap::clearSessionKeys() {
  std::lock_guard<std::mutex> lock(m_session_clients_mtx);
  m_session_auth_clients.clear();
}

void AuthMap::clearAllNonPersistentKeys() {
  clearTransientKeys();
  clearSessionKeys();
}

} // namespace Core
} // namespace SDMS
