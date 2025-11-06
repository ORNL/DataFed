#ifndef CONFIG_HPP
#define CONFIG_HPP
#pragma once

// Core local private includes
#include "AuthenticationManager.hpp"

// DataFed Common public includes
#include "common/DynaLog.hpp"
#include "common/ICredentials.hpp"
#include "common/SDMS.pb.h"

// Standard includes
#include <map>
#include <stdint.h>
#include <string>

namespace SDMS {
namespace MockCore {

// NOTE this would be better as an observer pattern using a separate object
// default public port 9998, private is assumed to be one above
// default private port = public_port + 1
class Config {
public:
  static Config &getInstance() {
    static Config inst;
    return inst;
  }

private:
  Config();

  std::map<std::string, RepoData> m_repos;

public:
  std::string cred_dir;
  uint32_t port;
  uint32_t repo_chunk_size;
  uint32_t repo_timeout;
  uint32_t num_client_worker_threads;

  std::map<std::string, RepoData> getRepos() const;
  std::unique_ptr<ICredentials> sec_ctx;

  /// Map of client key to DataFed ID
};

} // namespace MockCore
} // namespace SDMS

#endif
