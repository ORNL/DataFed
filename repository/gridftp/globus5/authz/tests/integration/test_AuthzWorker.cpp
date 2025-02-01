#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE getVersion
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "AuthzWorker.hpp"

// Standard includes
#include <cstdlib>    // For std::setenv
#include <filesystem> // For checking and removing files (C++17)
#include <fstream>
#include <iostream>

extern "C" {
// Globus third party includes
#include <globus_error_hierarchy.h>
#include <globus_types.h>
#include <gssapi.h>

// Local private includes
#include "Config.h"

// Globus third party includes
#include <globus_error_hierarchy.h>
#include <globus_types.h>
#include <gssapi.h>

// Declare functions
globus_result_t gsi_authz_init();
void initializeDefaults();
}

const std::string repo_id = "repo/samoas";
const std::string server_key_path = "../../mock_core/mock-datafed-core-key.pub";
const std::string server_address = "tcp://localhost:9998";
const std::string pub_key_path = "./datafed-repo-key.pub";
const std::string pub_key = "Wxwm^-Cf7cJrqS)}/B?cDAq(L=@AwSA*({jhBu1]";
const std::string priv_key_path = "./datafed-repo-key.priv";
const std::string priv_key = "1:BoDR8-#sGZuRWyP*jr+Csm-kT}zV:tn@gRDS.u";
const std::string log_path = "./datafed-gsi-authz.log";
const std::string user = "TheRock";
const std::string globus_collection_path = "/mnt/datafed";

BOOST_AUTO_TEST_SUITE(test_gsi)

BOOST_AUTO_TEST_CASE(test_gsi_authz_init) {

  std::string file_path = "./datafed-authz-test.conf";
  // Check if the file exists
  if (std::filesystem::exists(file_path)) {
    // Remove the existing file
    std::filesystem::remove(file_path);
  }

  // Create and write to the new file
  std::ofstream config_file(file_path);
  if (!config_file) {
    throw std::ios_base::failure("Failed to create the configuration file. " +
                                 file_path);
  }

  config_file << "server_address=" << server_address << std::endl;
  config_file << "server_key=" << server_key_path << std::endl;
  config_file << "repo_id=" << repo_id << std::endl;
  config_file << "pub_key=" << pub_key_path << std::endl;
  config_file << "priv_key=" << priv_key_path << std::endl;
  config_file << "log_path=" << log_path << std::endl;
  config_file << "user=" << user << std::endl;
  config_file << "globus_collection_path=" << globus_collection_path
              << std::endl;

  config_file.close();

  // Check if the file exists
  if (std::filesystem::exists(pub_key_path)) {
    // Remove the existing file
    std::filesystem::remove(pub_key_path);
  }

  // Create and write to the new file
  std::ofstream repo_pub(pub_key_path);
  if (!repo_pub) {
    throw std::ios_base::failure("Failed to create the configuration file. " +
                                 pub_key_path);
  }

  repo_pub << pub_key << std::endl;
  repo_pub.close();

  // Check if the file exists
  if (std::filesystem::exists(priv_key_path)) {
    // Remove the existing file
    std::filesystem::remove(priv_key_path);
  }

  // Create and write to the new file
  std::ofstream repo_priv(priv_key_path);
  if (!repo_priv) {
    throw std::ios_base::failure("Failed to create the configuration file. " +
                                 priv_key_path);
  }

  repo_priv << priv_key << std::endl;
  repo_priv.close();

  // Read in contents of core public key which should be generated on the spot
  // Open the file in input mode
  std::ifstream server_file(server_key_path);
  if (!server_file.is_open()) {
    std::cerr << "Failed to open file: " << server_key_path << std::endl;
  }

  // Use a string stream to read the entire file into a string
  std::ostringstream ss;
  ss << server_file.rdbuf();         // Read the file into the stream buffer
  std::string server_key = ss.str(); // Convert stream buffer to string

  // Output the contents, these keys are test keys
  std::cout << "File contents:\n" << server_key << std::endl;

  server_file.close(); // Close the file

  std::string conf_env_name = "DATAFED_AUTHZ_CFG_FILE";
  if (setenv(conf_env_name.c_str(), file_path.c_str(), 1) != 0) {
    throw std::runtime_error("Failed to set environment variable: " +
                             conf_env_name);
  }

  // Create a dummy config file to be loaded
  // server_address=tcp://${local_DATAFED_DOMAIN}:${local_DATAFED_SERVER_PORT}

  initializeDefaults();

  struct Config conf = createLocalConfigCopy();
  conf.repo_id[0] = '\0';
  conf.server_addr[0] = '\0';
  conf.pub_key[0] = '\0';
  conf.priv_key[0] = '\0';
  conf.server_key[0] = '\0';
  conf.user[0] = '\0';
  conf.log_path[0] = '\0';
  conf.globus_collection_path[0] = '\0';

  BOOST_CHECK_EQUAL(std::string(conf.repo_id), "");
  BOOST_CHECK_EQUAL(std::string(conf.server_addr), "");
  BOOST_CHECK_EQUAL(std::string(conf.pub_key), "");
  BOOST_CHECK_EQUAL(std::string(conf.priv_key), "");
  BOOST_CHECK_EQUAL(std::string(conf.server_key), "");
  BOOST_CHECK_EQUAL(std::string(conf.user), "");
  BOOST_CHECK_EQUAL(std::string(conf.log_path), "");
  BOOST_CHECK_EQUAL(std::string(conf.globus_collection_path), "");

  globus_result_t result = gsi_authz_init();

  auto config = createLocalConfigCopy();

	// Test a valid full FTP path when the globus_collection_path is /
	SDMS::LogContext log_context;

	strcpy(config.globus_collection_path, "/mnt/datafed");
	SDMS::AuthzWorker worker(config, log_context);

	char client_id[] = "23c9067f-60e8-4741-9af1-482280faced4";
	char path[] = "ftp://ci-datafed-globus2/mnt/datafed/datafedci-home";
	char action[] = "lookup";
	
	int rv = worker.checkAuth(client_id, path, action);

	BOOST_CHECK_EQUAL(rv, 0);
}

BOOST_AUTO_TEST_SUITE_END()
