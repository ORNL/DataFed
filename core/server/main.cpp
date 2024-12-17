// Local private includes
#include "CoreServer.hpp"
// Core server version
#include "Version.hpp"

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
#include <fstream>
#include <iostream>
#include <unistd.h>

using namespace std;
using namespace SDMS;
namespace po = boost::program_options;

/** @brief Entry point for Core Server
 *
 * Parses command line options then creates and runs a CoreServer instance.
 */
int main(int a_argc, char **a_argv) {
  global_logger.setSysLog(false);
  global_logger.addStream(std::cerr);
  global_logger.setLevel(LogLevel::INFO);
  LogContext log_context;
  log_context.thread_name = "core_server";
  log_context.thread_id = 0;

  try {

    DL_INFO(log_context, "DataFed core server starting, ver "
                             << core::version::MAJOR << "."
                             << core::version::MINOR << "."
                             << core::version::PATCH);

    Core::Config &config = Core::Config::getInstance();
    string cfg_file;
    bool gen_keys = false;

    LogLevel cfg_log_level = LogLevel::INFO;

    po::options_description opts("Options");

    opts.add_options()("help,?", "Show help")(
        "version,v", "Show version number")("cred-dir,c",
                                            po::value<string>(&config.cred_dir),
                                            "Server credentials directory")(
        "port,p", po::value<uint32_t>(&config.port), "Service port")(
        "db-url,u", po::value<string>(&config.db_url), "DB url")(
        "db-user,U", po::value<string>(&config.db_user), "DB user name")(
        "db-pass,P", po::value<string>(&config.db_pass), "DB password")(
        "glob-oauth-url", po::value<string>(&config.glob_oauth_url),
        "Globus authorization API base URL")(
        "glob-xfr-url", po::value<string>(&config.glob_xfr_url),
        "Globus transfer API base URL")(
        "client-id", po::value<string>(&config.client_id), "Client ID")(
        "client-secret", po::value<string>(&config.client_secret),
        "Client secret")("task-purge-age",
                         po::value<uint32_t>(&config.task_purge_age),
                         "Task purge age (seconds)")(
        "task-purge-per", po::value<uint32_t>(&config.task_purge_period),
        "Task purge period (seconds)")(
        "metrics-per", po::value<uint32_t>(&config.metrics_period),
        "Metrics update period (seconds)")(
        "metrics-purge-per", po::value<uint32_t>(&config.metrics_purge_period),
        "Metrics purge period (seconds)")(
        "metrics-purge-age", po::value<uint32_t>(&config.metrics_purge_age),
        "Metrics purge age (seconds)")(
        "client-threads",
        po::value<uint32_t>(&config.num_client_worker_threads),
        "Number of client worker threads")(
        "task-threads", po::value<uint32_t>(&config.num_task_worker_threads),
        "Number of task worker threads")("cfg", po::value<string>(&cfg_file),
                                         "Use config file for options")(
        "gen-keys", po::bool_switch(&gen_keys),
        "Generate new server keys then exit")(
        "log-level", po::value<LogLevel>(&cfg_log_level), "Set log level");

    try {
      po::variables_map opt_map;
      po::store(po::command_line_parser(a_argc, a_argv).options(opts).run(),
                opt_map);
      po::notify(opt_map);

      if (opt_map.count("help")) {
        // cout << "DataFed Core Server, ver. " << VER_MAJOR << "." <<
        // VER_MAPI_MAJOR << "." << VER_MAPI_MINOR << ":" << VER_CORE << "\n";
        cout << "DataFed Core Server, ver. " << core::version::MAJOR << "."
             << core::version::MINOR << "." << core::version::PATCH << "\n";
        cout << "Usage: datafed-core [options]\n";
        cout << opts << endl;
        return 0;
      }

      if (opt_map.count("version")) {
        cout << "Release Version: " << DATAFED_RELEASE_YEAR << "."
             << DATAFED_RELEASE_MONTH << "." << DATAFED_RELEASE_DAY << "."
             << DATAFED_RELEASE_HOUR << "." << DATAFED_RELEASE_MINUTE
             << std::endl;
        cout << "Messaging API: " << DATAFED_COMMON_PROTOCOL_API_MAJOR << "."
             << DATAFED_COMMON_PROTOCOL_API_MINOR << "."
             << DATAFED_COMMON_PROTOCOL_API_PATCH << endl;
        cout << "Core Server: " << core::version::MAJOR << "."
             << core::version::MINOR << "." << core::version::PATCH << endl;
        return 0;
      }

      if (cfg_file.size()) {
        ifstream optfile(cfg_file.c_str());
        if (!optfile.is_open())
          EXCEPT_PARAM(ID_CLIENT_ERROR,
                       "Could not open config file: " << cfg_file);

        po::store(po::parse_config_file(optfile, opts, false), opt_map);
        po::notify(opt_map);

        optfile.close();
      }

      if (config.cred_dir.size() && config.cred_dir.back() != '/') {
        config.cred_dir += "/";
      }

      if (gen_keys) {
        string pub_key, priv_key;
        generateKeys(pub_key, priv_key);

        string fname = config.cred_dir + "datafed-core-key.pub";
        ofstream outf(fname.c_str());
        if (!outf.is_open() || !outf.good())
          EXCEPT_PARAM(1, "Could not open file: " << fname);
        outf << pub_key;
        outf.close();

        fname = config.cred_dir + "datafed-core-key.priv";
        outf.open(fname.c_str());
        if (!outf.is_open() || !outf.good())
          EXCEPT_PARAM(1, "Could not open file: " << fname);
        outf << priv_key;
        outf.close();

        return 0;
      }
      if (cfg_log_level != LogLevel::INFO) {
        global_logger.setLevel(cfg_log_level);
      }
    } catch (po::unknown_option &e) {
      DL_ERROR(log_context, "Options error: " << e.what());
      return 1;
    }

    // Create and run CoreServer instance. Configuration is held in Config
    // singleton

    Core::Server server(log_context);
    server.run();

  } catch (TraceException &e) {
    DL_ERROR(log_context, "Exception: " << e.toString());
  } catch (exception &e) {
    DL_ERROR(log_context, "Exception: " << e.what());
  }

  return 0;
}
