#ifndef REPOSERVER_HPP
#define REPOSERVER_HPP
#pragma once

// Local private includes
#include "Config.hpp"
#include "RequestWorker.hpp"

// Standard includes
#include <condition_variable>
#include <map>
#include <mutex>
#include <stdint.h>
#include <string>
#include <thread>
#include <unistd.h>

namespace SDMS {
namespace Repo {

/** @brief RepoServer connects with CoreServer and starts request processing
 * workers
 *
 * The ReposServer class deals with configuration, setting up external
 * interface, and starting request processing workers. An internal 0MQ proxy
 * thread is used to pass received messages to any available worker via in-proc
 * 0MQ queue. Once the server is started, it will not exit (unless a critical
 * error causes an abort).
 */

class Server {
 public:
  Server();
  virtual ~Server();

  Server& operator=(const Server&) = delete;

  void run();

 private:
  void loadKeys();
  void checkServerVersion();
  void ioSecure();

  Config& m_config;
  std::thread* m_io_thread;
  std::string m_pub_key;
  std::string m_priv_key;
  std::string m_core_key;
  std::vector<RequestWorker*> m_req_workers;
};

}  // namespace Repo
}  // namespace SDMS

#endif
