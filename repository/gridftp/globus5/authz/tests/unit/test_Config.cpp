#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE getVersion
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

extern "C" {
#include "Config.h"
}

#include <filesystem> // For std::filesystem::exists and std::filesystem::remove
#include <iostream>

void setEnvVar() {
  const char *config_file_path_key = "DATAFED_AUTHZ_CFG_FILE";
  const char *config_file_path_value = "./datafed-authz.cfg";

  if (setenv(config_file_path_key, config_file_path_value, 1) == 0) {
    std::cout << config_file_path_key << " is set to " << config_file_path_value
              << std::endl;
  } else {
    std::cerr << "Failed to set environment variable." << std::endl;
  }
}

void removeLocalCfgFile() {
  std::string cfg_file_path = "./datafed-authz.cfg";
  if (std::filesystem::exists(cfg_file_path)) {
    std::cout << "File exists. Removing: " << cfg_file_path << std::endl;
    std::filesystem::remove(cfg_file_path);
    std::cout << "File removed successfully." << std::endl;
  } else {
    std::cout << "File does not exist: " << cfg_file_path << std::endl;
  }
}

void createKeyFile(std::string file_path, std::string content) {
  std::ofstream file_stream(file_path);
  // Check if the file is open
  if (!file_stream.is_open()) {
    std::cerr << "Failed to open or create the file: " << file_path
              << std::endl;
    return;
  }

  file_stream << content;
  file_stream.close();
}

static const std::string pub_key = "s@!#0N^FPml<]O<cn510uFgcnkUCg.F!YirBgYNh";
static const std::string priv_key = "*7#J>YR&>3p&wX2g+V%AT!/2Ys7bSGZLyq8M:Kb#";
static const std::string server_key =
    "^-j(*ypiy?Nt9^K.c3GRS?4)j?4a:O.%yV=2+qLs";
static const std::string server_address = "tcp://datafed.global.com:9932";
static const std::string repo_id = "repo/red_wing";
static const std::string log_path = "./datafed-gsi-authz.log";
static const std::string user = "iron_man";
static const std::string collection_path = "./collections";

void createFiles() {
  // NOTE - the keys in this file are dummy values
  std::string pub_key_path = "./datafed-repo-key.pub";
  std::string priv_key_path = "./datafed-repo-key.priv";
  std::string server_key_path = "./datafed-core-key.pub";

  createKeyFile(pub_key_path, pub_key);
  createKeyFile(priv_key_path, priv_key);
  createKeyFile(server_key_path, server_key);

  std::string cfg_file_path = "./datafed-authz.cfg";
  // Open the file for writing
  std::ofstream configFile(cfg_file_path);

  // Check if the file is open
  if (!configFile.is_open()) {
    std::cerr << "Failed to open or create the file: " << cfg_file_path
              << std::endl;
    return;
  }

  // Write the content to the file
  configFile << "server_address=" << server_address << "\n";
  configFile << "server_key=" << server_key_path << "\n";
  configFile << "repo_id=" << repo_id << "\n";
  configFile << "pub_key=" << pub_key_path << "\n";
  configFile << "priv_key=" << priv_key_path << "\n";
  configFile << "log_path=" << log_path << "\n";
  configFile << "user=" << user << "\n";
  configFile << "globus_collection_path=" << collection_path << "\n";

  // Close the file
  configFile.close();

  // Notify the user
  std::cout << "File created successfully: " << cfg_file_path << std::endl;
}

BOOST_AUTO_TEST_SUITE(config)

BOOST_AUTO_TEST_CASE(TestInitializeGlobalConfigThatDoesNotExist) {
  setEnvVar();
  removeLocalCfgFile();

  // Should fail because no config file is specified, failure will return true
  BOOST_CHECK(initializeGlobalConfig());
}

BOOST_AUTO_TEST_CASE(TestInitializeGlobalConfig) {
  setEnvVar();
  removeLocalCfgFile();
  createFiles();

  // Should fail because no config file is specified, err will return true
  BOOST_CHECK(initializeGlobalConfig() == false);
}

BOOST_AUTO_TEST_CASE(TestInitializeAndGetConfigVal) {
  setEnvVar();
  createFiles();
  // Make sure previous tests don't interfere
  allowConfigReinitialization();
  initializeGlobalConfig();

  size_t buffer_size = 200;
  char buffer[buffer_size];
  bool err = getConfigVal("repo_id", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), repo_id);

  err = getConfigVal("server_addr", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), server_address);

  err = getConfigVal("server_key", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), server_key);

  err = getConfigVal("pub_key", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), pub_key);

  err = getConfigVal("priv_key", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), priv_key);

  err = getConfigVal("log_path", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), log_path);

  err = getConfigVal("user", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), user);

  err = getConfigVal("globus_collection_path", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), collection_path);
}
//
BOOST_AUTO_TEST_CASE(TestInitializeAndGetConfigVal_InvalidLabel) {
  setEnvVar();
  createFiles();
  // Make sure previous tests don't interfere
  allowConfigReinitialization();
  initializeGlobalConfig();

  size_t buffer_size = 200;
  char buffer[buffer_size];
  bool err = getConfigVal("grand_piano", buffer, buffer_size);
  BOOST_CHECK(err);
  BOOST_CHECK_EQUAL(std::string(buffer), "");
}

BOOST_AUTO_TEST_CASE(TestInitializeAndGetAndSetConfigVal) {
  setEnvVar();
  createFiles();
  // Make sure previous tests don't interfere
  allowConfigReinitialization();
  initializeGlobalConfig();

  size_t buffer_size = 200;
  char buffer[buffer_size];
  bool err = getConfigVal("repo_id", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), repo_id);

  std::string new_repo_id = "repo/violin";
  err = setConfigVal("repo_id", new_repo_id.c_str());
  BOOST_CHECK(err == false);

  err = getConfigVal("repo_id", buffer, buffer_size);
  BOOST_CHECK(err == false);
  BOOST_CHECK_EQUAL(std::string(buffer), new_repo_id);
}

BOOST_AUTO_TEST_CASE(TestInitializeLocalConfig) {
  setEnvVar();
  createFiles();
  // Make sure previous tests don't interfere
  allowConfigReinitialization();
  initializeGlobalConfig();

  struct Config local_copy = createLocalConfigCopy();

  std::string new_repo_id = "repo/violin";
  bool err = setConfigVal("repo_id", new_repo_id.c_str());
  BOOST_CHECK(err == false);

  // Make sure the local copy sill looks like the old repo
  BOOST_CHECK_EQUAL(std::string(local_copy.repo_id), repo_id);
}

BOOST_AUTO_TEST_SUITE_END()
