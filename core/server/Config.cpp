
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

  DatabaseAPI db_client(db_url, db_user, db_pass, cred_dir);

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
      auth_manager.addKey(PublicKeyType::PERSISTENT, r.pub_key(), r.id());

      // Cache repo data for data handling
      m_repos_mtx.lock();
      DL_TRACE(log_context, std::string("Repo ")
                                << r.id() << " OK - UUID: " << r.endpoint()
                                << " address: " << r.address());
      m_repos[r.id()] = r;
      m_trigger_repo_refresh = false;
      m_repos_mtx.unlock();
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
