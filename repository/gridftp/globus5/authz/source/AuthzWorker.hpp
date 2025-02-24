#ifndef AUTHZWORKER_HPP
#define AUTHZWORKER_HPP
#pragma once

// Private includes
#include "Config.h"

// Common public includes
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/ICredentials.hpp"

// Standard includes
#include <memory>
#include <string>

namespace SDMS {

/**
 * @class AuthzWorker
 * @brief Handles authorization checking, path validation, and FTP URL
 * processing.
 *
 * The `AuthzWorker` class is responsible for handling authorization requests,
 * validating paths, processing FTP URLs, and interacting with a core service to
 * perform authorization checks. It utilizes a communicator for sending and
 * receiving messages and manages security credentials to perform its
 * operations.
 *
 * The class provides various methods for:
 * - Checking the validity of paths and URLs.
 * - Verifying authorization for a client on a given path with a specified
 * action.
 * - Removing the origin portion of an FTP URL to extract the path.
 * - Processing responses from the core service to determine authorization
 * success or failure.
 *
 * The class requires configuration and logging context for proper
 * initialization.
 */
class AuthzWorker {
public:
  AuthzWorker(struct Config *a_config, LogContext log_context);

  ~AuthzWorker() {}

  AuthzWorker &operator=(const AuthzWorker &) = delete;

  int checkAuth(char *client_id, char *path, char *action);

  bool isTestPath(const std::string &) const;
  bool isURLValid(char *full_ftp_url) const;
  bool isPathValid(const std::string &posix_path) const;
  std::string getAuthzPath(char *full_ftp_url);
  std::string removeOrigin(char *full_ftp_url) const;

  int processResponse(ICommunicator::Response &response);

private:
  void initCommunicator();
  struct Config *m_config;
  std::string m_test_path;
  std::string m_local_globus_path_root;
  LogContext m_log_context;

  std::unique_ptr<ICredentials> m_sec_ctx;
  std::unique_ptr<ICommunicator> m_comm;
  std::unordered_map<CredentialType, std::string> m_cred_options;
};

} // namespace SDMS
#endif // AUTHZWORKER_HPP
