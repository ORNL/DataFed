
#define DEF_DYNALOG
// Local private includes
#include "Config.hpp"
#include "MockGlobals.hpp"

// Local public includes
#include "common/DynaLog.hpp"

// Standard includes
#include <memory>

namespace SDMS {
namespace MockCore {

// NOTE this would be better as an observer pattern using a separate object
// default public port 9998, private is assumed to be one above
// default private port = public_port + 1
Config::Config()
    : port(MockGlobals::repo_port), repo_chunk_size(100),
      num_client_worker_threads(4), repo_timeout(60000) {

  RepoData r;

  r.set_id(MockGlobals::repo_id);       // Required field
  r.set_title(MockGlobals::repo_title); // Optional field
  r.set_desc(MockGlobals::repo_desc);
  r.set_capacity(MockGlobals::repo_capacity);
  // The following key is a dummy key meant for testing however the public
  // private key pair have to be used together for zeromq to work. Even though
  // they are dummy keys for testing they are valid.
  r.set_pub_key(MockGlobals::pub_repo_key);
  // Address this is how the core service will communicate with the repo srevice
  r.set_address(MockGlobals::repo_listen_address);
  // This is just a placeholder and has no corresponding globus endpoint
  // associated with it.
  r.set_endpoint(MockGlobals::repo_globus_uuid);
  r.set_path(MockGlobals::repo_path);
  r.set_domain("");
  r.set_exp_path("");
  m_repos[r.id()] = r;
}

std::map<std::string, RepoData> Config::getRepos() const { return m_repos; }

} // namespace MockCore
} // namespace SDMS
