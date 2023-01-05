
#include <vector>
#include <memory>
#include <mutex>
#include "Config.hpp"
#include "DatabaseAPI.hpp"
#include "DynaLog.hpp"

namespace SDMS {
  namespace Core {

    void Config::loadRepositoryConfig() {
      DL_INFO("Loading repo configuration " << __FILE__ << " " <<  __LINE__);

      DatabaseAPI  db_client( db_url, db_user, db_pass );

      std::vector<RepoData> temp_repos;

      db_client.repoList( temp_repos );

      for ( RepoData & r : temp_repos ) {
        {
          // Cache pub key for ZAP handler
          m_auth_clients_mtx.lock();
          m_auth_clients[r.pub_key()] = r.id();
          m_auth_clients_mtx.unlock();

          // Cache repo data for data handling
          m_repos_mtx.lock();
          m_repos[r.id()] = r;
          m_repos_mtx.unlock();
        }
      }
    }

    std::map<std::string,RepoData> Config::getRepos() const {
      std::lock_guard<std::mutex> lock(m_repos_mtx);
      std::map<std::string,RepoData> repos = m_repos;
      return repos;
    } 

    Config::auth_client_map_t Config::getAuthClients() const {
      std::lock_guard<std::mutex> lock(m_auth_clients_mtx);
      auth_client_map_t copy_of_clients = m_auth_clients;
      return copy_of_clients;
    }
  } // namespace Core
}
