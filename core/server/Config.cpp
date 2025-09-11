
#define DEF_DYNALOG
// Local private includes
#include "Config.hpp"
#include "DatabaseAPI.hpp"

// Local public includes
#include "common/DynaLog.hpp"

// Standard includes
#include <memory>
#include <mutex>
#include <vector>

namespace SDMS {
namespace Core {

void Config::loadRepositoryConfig(AuthenticationManager &auth_manager,
                                  LogContext log_context) {
  DL_DEBUG(log_context, "Loading repo configuration ");

  // Only load the repository config if it needs to be refreshed
  m_repos_mtx.lock();
  if (m_trigger_repo_refresh == false) {
    m_repos_mtx.unlock();
    return;
  } else {
    m_repos_mtx.unlock();
  }

  // Clear all non-persistent keys before reloading repository configurations
  // This ensures stale cached keys don't interfere with authentication.
  // NOTE: Non-persistent keys are cleared during configuration reload (typically at startup or explicit refresh).
  // This may impact any sessions active during a reload, but such cases are rare in normal operation.
  DL_INFO(log_context, "Clearing non-persistent keys before loading repository configuration");
  auth_manager.clearAllNonPersistentKeys();

  DatabaseAPI db_client(db_url, db_user, db_pass);

  std::vector<RepoData> temp_repos;

  // list the repos and place them in the vector
  db_client.repoList(temp_repos, log_context);
  // Get the full view of the repos that were listed
  db_client.repoView(temp_repos, log_context);

  // Find which repos are temp_repos that are no longer in m_repos

  DL_TRACE(log_context, "Registered repos are:");
  for (RepoData &r : temp_repos) {
    {
      // Validate repo settings (in case an admin manually edits repo config)
      if (r.pub_key().size() != 40) {
        DL_ERROR(log_context, "Ignoring " << r.id() << " - invalid public key: "
                                          << r.pub_key());
        continue;
      }

      if (r.address().compare(0, 6, "tcp://")) {
        DL_ERROR(log_context,
                 "Ignoring " << r.id()
                             << " - invalid server address: " << r.address());
        continue;
      }

      if (r.endpoint().size() != 36) {
        DL_ERROR(log_context,
                 "Ignoring " << r.id()
                             << " - invalid endpoint UUID: " << r.endpoint());
        continue;
      }

      if (r.path().size() == 0 || r.path()[0] != '/') {
        DL_ERROR(log_context,
                 "Ignoring " << r.id() << " - invalid path: " << r.path());
        continue;
      }

      // Cache pub key for ZAP handler
      // Historical bug (DAPS-1625): Repository keys could be incorrectly cached as 
      // transient/session keys if loadRepositoryConfig() was called before the 
      // AuthenticationManager was properly initialized. This is now fixed by proper
      // initialization order in CoreServer.cpp, but we keep the migration logic
      // during config reloads.
      DL_TRACE(log_context, "Registering repo " << r.id());
      
      // Check for duplicate keys across different maps
      bool in_transient = auth_manager.hasKey(PublicKeyType::TRANSIENT, r.pub_key());
      bool in_session = auth_manager.hasKey(PublicKeyType::SESSION, r.pub_key());
      
      if (in_transient && in_session) {
        // Key exists in both maps - this is an inconsistent state
        DL_WARNING(log_context, "Repo " << r.id() << " key found in BOTH TRANSIENT and SESSION maps. "
                   << "Removing from both and adding to PERSISTENT.");
        auth_manager.migrateKey(PublicKeyType::TRANSIENT, PublicKeyType::PERSISTENT, r.pub_key(), r.id());
        auth_manager.migrateKey(PublicKeyType::SESSION, PublicKeyType::PERSISTENT, r.pub_key(), r.id());
      } else if (in_transient) {
        DL_INFO(log_context, "Repo " << r.id() << " key found in TRANSIENT map, migrating to PERSISTENT");
        auth_manager.migrateKey(PublicKeyType::TRANSIENT, PublicKeyType::PERSISTENT, r.pub_key(), r.id());
      } else if (in_session) {
        DL_INFO(log_context, "Repo " << r.id() << " key found in SESSION map, migrating to PERSISTENT");
        auth_manager.migrateKey(PublicKeyType::SESSION, PublicKeyType::PERSISTENT, r.pub_key(), r.id());
      } else {
        // Normal case - add as new PERSISTENT key
        DL_TRACE(log_context, "Adding repo " << r.id() << " key as new PERSISTENT key");
        auth_manager.addKey(PublicKeyType::PERSISTENT, r.pub_key(), r.id());
      }

      // Cache repo data for data handling
      m_repos_mtx.lock();
      DL_INFO(log_context, std::string("Repo ")
                                << r.id() << " OK - UUID: " << r.endpoint()
                                << " address: " << r.address());
      m_repos[r.id()] = r;
      m_trigger_repo_refresh = false;
      m_repos_mtx.unlock();
    }
  }
  
  // Validate that repository keys are still present after loading
  DL_TRACE(log_context, "Validating repository keys after loading");
  for (const auto& repo_pair : m_repos) {
    const RepoData& repo = repo_pair.second;
    if (auth_manager.hasKey(PublicKeyType::PERSISTENT, repo.pub_key())) {
      DL_TRACE(log_context, "Key for " << repo.id() << " verified in PERSISTENT map");
    } else {
      DL_ERROR(log_context, "KEY MISSING! Repository " << repo.id() 
               << " key not found after loading!");
    }
  }
}

// NOTE this would be better as an observer pattern using a separate object
void Config::triggerRepoCacheRefresh() {
  std::lock_guard<std::mutex> lock(m_repos_mtx);
  m_trigger_repo_refresh = true;
}

bool Config::repoCacheInvalid() {
  std::lock_guard<std::mutex> lock(m_repos_mtx);
  return m_trigger_repo_refresh;
}

std::map<std::string, RepoData> Config::getRepos() const {
  std::lock_guard<std::mutex> lock(m_repos_mtx);
  std::map<std::string, RepoData> repos = m_repos;
  return repos;
}

} // namespace Core
} // namespace SDMS
