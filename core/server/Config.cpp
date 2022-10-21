
#include <vector>
#include <memory>
#include <mutex>
#include "Config.hpp"
#include "DatabaseAPI.hpp"
#include "DynaLog.hpp"

namespace SDMS {
  namespace Core {

    void Config::loadTestMode()
    {
        DatabaseAPI  db_client( db_url, db_user, db_pass );

        test_mode = db_client.getTestMode();
        DL_ERROR("config test mode:" << test_mode);
    }

    void Config::loadRepositoryConfig() {
      DL_INFO("Loading repo configuration " << __FILE__ << " " <<  __LINE__);

      DatabaseAPI  db_client( db_url, db_user, db_pass );

      std::vector<RepoData> temp_repos;

      db_client.repoList( temp_repos );

      for ( RepoData & r : temp_repos ) {
        {
          // Validate repo settings (in case an admin manually edits repo config)
          if ( r.pub_key().size() != 40 ){
            DL_ERROR("Ignoring " << r.id() << " - invalid public key: " << r.pub_key() );
            continue;
          }

          if ( r.address().compare(0,6,"tcp://") ){
            DL_ERROR("Ignoring " << r.id() << " - invalid server address: " << r.address() );
            continue;
          }

          if ( r.endpoint().size() != 36 ){
            DL_ERROR("Ignoring " << r.id() << " - invalid endpoint UUID: " << r.endpoint() );
            continue;
          }

          if ( r.path().size() == 0 || r.path()[0] != '/' ){
            DL_ERROR("Ignoring " << r.id() << " - invalid path: " << r.path() );
            continue;
          }

          DL_DEBUG("Repo " << r.id() << " OK");
          DL_DEBUG("UUID: " << r.endpoint() );

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
