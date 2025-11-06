// Local private includes
#include "MockCoreServer.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// messaging version
#include "common/Version.pb.h"

// Third party includes
#include <boost/program_options.hpp>

// Standard includes
#include "Config.hpp"
#include <climits>
#include <fstream>
#include <iostream>
#include <unistd.h>

using namespace std;
using namespace SDMS;
namespace po = boost::program_options;

void create_pid_file() {

  std::string pid_file = "./server.pid";
  std::ofstream file(pid_file);
  if (!file) {
    std::cerr << "Failed to create PID file: " << pid_file << std::endl;
    exit(EXIT_FAILURE);
  }
  file << getpid(); // Write the current process ID to the file
  file.close();
  std::cout << "PID file created: " << pid_file << std::endl;
}

/** @brief Entry point for Mock Core Server
 *
 * Parses command line options then creates and runs a MockCoreServer instance.
 */
int main(int a_argc, char **a_argv) {
  global_logger.setSysLog(false);
  global_logger.addStream(std::cerr);
  global_logger.setLevel(LogLevel::INFO);
  LogContext log_context;
  log_context.thread_name = "mock_core_server";
  log_context.thread_id = 0;

  try {

    create_pid_file();
    DL_INFO(log_context, "DataFed mock core server starting.");

    MockCore::Config &config = MockCore::Config::getInstance();
    bool gen_keys = false;

    // Note: we may want to dynamically choose type at compile time
    // based on underlying type of LogLevel enum
    unsigned int cfg_log_level = UINT_MAX;

    po::options_description opts("Options");

    opts.add_options()("help,?", "Show help")(
        "cred-dir,c", po::value<string>(&config.cred_dir),
        "Server credentials directory, will look for files "
        "mock-datafed-core.priv and mock-datafed-core.pub.")(
        "port,p", po::value<uint32_t>(&config.port),
        "Service port, this is the public port core service is listening on "
        "for mock set to 9998, private by default is public_port + 1")(
        "gen-keys", po::bool_switch(&gen_keys),
        "Generate new server keys then exit")(
        "log-level", po::value<unsigned int>(&cfg_log_level), "Set log level");

    try {
      po::variables_map opt_map;
      po::store(po::command_line_parser(a_argc, a_argv).options(opts).run(),
                opt_map);
      po::notify(opt_map);

      if (opt_map.count("help")) {
        cout << "Usage: mock-datafed-core [options]\n";
        cout << opts << endl;
        return 0;
      }

      if (gen_keys) {
        string pub_key, priv_key;
        generateKeys(pub_key, priv_key);

        string fname = "./mock-datafed-core-key.pub";
        ofstream outf(fname.c_str());
        if (!outf.is_open() || !outf.good())
          EXCEPT_PARAM(1, "Could not open file: " << fname);
        outf << pub_key;
        outf.close();

        fname = "./mock-datafed-core-key.priv";
        outf.open(fname.c_str());
        if (!outf.is_open() || !outf.good())
          EXCEPT_PARAM(1, "Could not open file: " << fname);
        outf << priv_key;
        outf.close();

        return 0;
      }
      if (cfg_log_level != UINT_MAX) {
        if (cfg_log_level >=
            static_cast<unsigned int>(LogLevel::LAST_SENTINEL)) {
          DL_ERROR(log_context,
                   "Invalid log level provided, defaulting to INFO");
        } else {
          LogLevel cast_log_level = static_cast<LogLevel>(cfg_log_level);
          std::string str_log_level = "";
          switch (cast_log_level) {
          case LogLevel::CRITICAL:
            str_log_level = "CRITICAL";
            break;
          case LogLevel::ERROR:
            str_log_level = "ERROR";
            break;
          case LogLevel::WARNING:
            str_log_level = "WARNING";
            break;
          case LogLevel::INFO:
            str_log_level = "INFO";
            break;
          case LogLevel::DEBUG:
            str_log_level = "DEBUG";
            break;
          case LogLevel::TRACE:
            str_log_level = "TRACE";
            break;
          case LogLevel::LAST_SENTINEL:
            str_log_level = "INVALID"; // should never be reached
            EXCEPT_PARAM(1, "Unexpected state when setting log level, " +
                                to_string(cfg_log_level));
            break;
          }
          std::string log_message = "Setting log level to " + str_log_level;
          DL_INFO(log_context, log_message);
          global_logger.setLevel(cast_log_level);
        }
      }
    } catch (po::unknown_option &e) {
      DL_ERROR(log_context, "Options error: " << e.what());
      return 1;
    }

    // Create and run CoreServer instance. Configuration is held in Config
    // singleton
    std::cout << std::endl;
    std::cout << "Config cred_dir: " << config.cred_dir << std::endl;
    std::cout << "Config port: " << std::to_string(config.port) << std::endl;
    std::cout << "Config repo_chunk_size: "
              << std::to_string(config.repo_chunk_size) << std::endl;
    std::cout << "Config num_client_worker_threads: "
              << std::to_string(config.num_client_worker_threads) << std::endl;
    std::cout << std::endl;
    auto repos = config.getRepos();
    std::cout << "Mocked Repos" << std::endl;
    for (const auto &repo : repos) {
      std::cout << "Repo Id: " << repo.second.id() << std::endl;
      std::cout << "title: " << repo.second.title() << std::endl;
      std::cout << "desc: " << repo.second.desc() << std::endl;
      std::cout << "capacity: " << std::to_string(repo.second.capacity())
                << std::endl;
      std::cout << "address: " << repo.second.address() << std::endl;
      std::cout << "endpoint: " << repo.second.endpoint() << std::endl;
      std::cout << "path: " << repo.second.path() << std::endl;
      std::cout << "domain: " << repo.second.domain() << std::endl;
      std::cout << "exp_path: " << repo.second.exp_path() << std::endl;
      std::cout << std::endl;
    }

    MockCore::Server server(log_context);
    server.run();

  } catch (TraceException &e) {
    DL_ERROR(log_context, "Exception: " << e.toString());
  } catch (exception &e) {
    DL_ERROR(log_context, "Exception: " << e.what());
  }

  return 0;
}
