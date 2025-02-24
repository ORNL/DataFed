#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE AuthzWorker
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Private includes
#include "AuthzWorker.hpp"

// Public includes
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/IMessage.hpp"
#include "common/MessageFactory.hpp"
#include "common/SDMS_Anon.pb.h"
#include "common/TraceException.hpp"

extern "C" {
#include "Config.h"
}

class ConfigFixture {
public:
  // Setup: create the object before each test case
  // The below settings are simply for testing and are not
  // used in anyway in a production environment.
  ConfigFixture() {
    std::string repo_id = "datafed-one-repo-to-rule-them-all";
    std::string server_addr = "tcp://ruler:7513";
    std::string pub_key = "=+r^&Qc&}f<Pho7ViJwVM5(Ze^o%UnnyA:XjF}7Q";
    std::string priv_key = "X4y+AFXCmBoyKrc0J0V5}Z2HpCYRf3(wvhe**z))";
    std::string server_key = "a.r)OeoL=?/rHaK1-ow<xOd7YxM/6)A&Kdu]*<)3";
    std::string user = "vader";
    std::string test_path = "";
    std::string log_path = "./";
    std::string globus_collection_path = "/globus/root";
    //
    std::strcpy(config.repo_id, repo_id.c_str());
    std::strcpy(config.server_addr, server_addr.c_str());
    std::strcpy(config.pub_key, pub_key.c_str());
    std::strcpy(config.priv_key, priv_key.c_str());
    std::strcpy(config.server_key, server_key.c_str());
    std::strcpy(config.user, user.c_str());
    std::strcpy(config.test_path, test_path.c_str());
    std::strcpy(config.log_path, log_path.c_str());
    std::strcpy(config.globus_collection_path, globus_collection_path.c_str());
  }

  // Teardown: clean up after each test case
  ~ConfigFixture() {}

  // Accessor for the object

  Config config;

private:
};

BOOST_FIXTURE_TEST_SUITE(AuthzTest, ConfigFixture)

BOOST_AUTO_TEST_CASE(test_authz_worker_construction) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::cout << std::string(config.repo_id) << std::endl;
}

BOOST_AUTO_TEST_CASE(isTestPathValid) {

  SDMS::LogContext log_context;
  std::string test_path = "/valid/test/path/";
  std::strcpy(config.test_path, test_path.c_str());
  SDMS::AuthzWorker worker(&config, log_context);
  BOOST_CHECK(worker.isTestPath(test_path));
}

BOOST_AUTO_TEST_CASE(isTestPath_InvalidTestPath) {
  SDMS::LogContext log_context;
  // Setup a valid test path
  std::string test_path = "/valid/test/path/";
  std::strcpy(config.test_path, test_path.c_str());
  SDMS::AuthzWorker worker(&config, log_context);

  // Test when path does not match the test prefix
  BOOST_CHECK(!worker.isTestPath("/invalid/path"));
}

BOOST_AUTO_TEST_CASE(TestIsTestPath_ShorterPath) {
  SDMS::LogContext log_context;
  // Setup a valid test path
  std::string test_path = "/valid/test/path/";
  std::strcpy(config.test_path, test_path.c_str());
  SDMS::AuthzWorker worker(&config, log_context);

  // Test when path is shorter should be invalid
  BOOST_CHECK(!worker.isTestPath("/valid"));
}

BOOST_AUTO_TEST_CASE(TestIsTestPath_LongerPath) {
  SDMS::LogContext log_context;
  // Setup a valid test path
  std::string test_path = "/valid/test/path/";
  std::strcpy(config.test_path, test_path.c_str());
  SDMS::AuthzWorker worker(&config, log_context);

  // Test when path is longer but aligns
  BOOST_CHECK(worker.isTestPath("/valid/test/path/foo"));
}

BOOST_AUTO_TEST_CASE(TestIsTestPath_NoTestPath) {
  SDMS::LogContext log_context;
  // Setup a valid test path
  SDMS::AuthzWorker worker(&config, log_context);

  // Test when path is shorter should be valid
  BOOST_CHECK(!worker.isTestPath("/valid/test/path/foo"));
}

BOOST_AUTO_TEST_CASE(ValidPathTest) {
  // Test a valid POSIX path
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::string valid_path = "/globus/root/subdir/file.txt";
  BOOST_CHECK(worker.isPathValid(valid_path) == true);
}

BOOST_AUTO_TEST_CASE(InvalidPathTooShortTest) {
  // Test an invalid POSIX path (too short)
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::string invalid_path = "/globus";
  BOOST_CHECK(worker.isPathValid(invalid_path) == false);
}

BOOST_AUTO_TEST_CASE(InvalidPathNoPrefixTest) {
  // Test an invalid POSIX path (wrong prefix)
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::string invalid_path = "/wrong/root/subdir/file.txt";
  BOOST_CHECK(worker.isPathValid(invalid_path) == false);
}

BOOST_AUTO_TEST_CASE(ExactRootPathTest) {
  // Test a valid path that exactly matches the root
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::string exact_root_path = "/globus/root";
  BOOST_CHECK(worker.isPathValid(exact_root_path) == true);
}

BOOST_AUTO_TEST_CASE(EdgeCaseEmptyPathTest) {
  // Test an empty path
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::string empty_path = "";
  BOOST_CHECK(worker.isPathValid(empty_path) == false);
}

BOOST_AUTO_TEST_CASE(EdgeCaseTrailingSlashTest) {
  // Test a valid path with a trailing slash
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::string trailing_slash_path = "/globus/root/";
  BOOST_CHECK(worker.isPathValid(trailing_slash_path) == true);
}

BOOST_AUTO_TEST_CASE(ValidURLTest) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // Test a valid FTP URL
  char valid_url[] = "ftp://hostname/path/to/file.txt";
  BOOST_CHECK(worker.isURLValid(valid_url) == true);
}

BOOST_AUTO_TEST_CASE(InvalidURLMissingSchemeTest) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // Test an FTP URL missing the "ftp://" scheme
  char invalid_url[] = "hostname/path/to/file.txt";
  BOOST_CHECK(worker.isURLValid(invalid_url) == false);
}

BOOST_AUTO_TEST_CASE(GetAuthzPathGlobusBaseSetToRoot) {
  // Test a valid full FTP path when the globus_collection_path is /
  SDMS::LogContext log_context;
  config.globus_collection_path[0] = '/';
  config.globus_collection_path[1] = '\0';
  SDMS::AuthzWorker worker(&config, log_context);
  char deep_path[] = "ftp://hostname/globus/root/a/b/c/d/e.txt";
  std::string expected_result = "/globus/root/a/b/c/d/e.txt";

  BOOST_CHECK_EQUAL(worker.getAuthzPath(deep_path), expected_result);
}

BOOST_AUTO_TEST_CASE(InvalidURLTooFewSlashesTest) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // Test an FTP URL with less than three '/' characters
  char invalid_url[] = "ftp://host";
  BOOST_CHECK(worker.isURLValid(invalid_url) == false);
}

BOOST_AUTO_TEST_CASE(EmptyURLTest) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // Test an empty FTP URL
  char empty_url[] = "";
  BOOST_CHECK(worker.isURLValid(empty_url) == false);
}

BOOST_AUTO_TEST_CASE(URLWithTrailingSlashTest) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // Test a valid FTP URL with a trailing slash
  char trailing_slash_url[] = "ftp://hostname/path/";
  BOOST_CHECK(worker.isURLValid(trailing_slash_url) == true);
}

BOOST_AUTO_TEST_CASE(URLWithoutHostnameTest) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // Test an FTP URL missing the hostname but still has "ftp://"
  char no_hostname_url[] = "ftp:///path/to/file.txt";
  BOOST_CHECK(worker.isURLValid(no_hostname_url) == false);
}

BOOST_AUTO_TEST_CASE(RemoveOriginGlobusBaseSetToRoot) {
  // Test a valid full FTP path when the globus_collection_path is /
  SDMS::LogContext log_context;
  config.globus_collection_path[0] = '/';
  config.globus_collection_path[1] = '\0';
  SDMS::AuthzWorker worker(&config, log_context);
  char deep_path[] = "ftp://hostname/globus/root/a/b/c/d/e.txt";
  std::string expected_result = "/globus/root/a/b/c/d/e.txt";

  BOOST_CHECK_EQUAL(worker.removeOrigin(deep_path), expected_result);
}

BOOST_AUTO_TEST_CASE(RemoveOriginValidURLTest) {
  // Test a valid FTP URL
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char valid_url[] = "ftp://hostname/path/to/file.txt";
  std::string expected_result = "/path/to/file.txt";
  BOOST_CHECK_EQUAL(worker.removeOrigin(valid_url), expected_result);
}

BOOST_AUTO_TEST_CASE(RemoveOriginInvalidURLTest) {
  // Test an invalid FTP URL (missing "ftp://")
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char invalid_url[] = "hostname/path/to/file.txt";
  BOOST_CHECK_THROW(worker.removeOrigin(invalid_url), TraceException);
}

BOOST_AUTO_TEST_CASE(RemoveOriginEmptyURLTest) {
  // Test an empty FTP URL
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char empty_url[] = "";
  BOOST_CHECK_THROW(worker.removeOrigin(empty_url), TraceException);
}

BOOST_AUTO_TEST_CASE(RemoveOriginTrailingSlashTest) {
  // Test a valid FTP URL with a trailing slash
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char trailing_slash_url[] = "ftp://hostname/path/";
  std::string expected_result = "/path/";
  BOOST_CHECK_EQUAL(worker.removeOrigin(trailing_slash_url), expected_result);
}

BOOST_AUTO_TEST_CASE(RemoveOriginRootPathTest) {
  // Test an FTP URL pointing to the root path
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char root_path_url[] = "ftp://hostname/";
  std::string expected_result = "/";
  BOOST_CHECK_EQUAL(worker.removeOrigin(root_path_url), expected_result);
}

BOOST_AUTO_TEST_CASE(RemoveOriginDeepPathTest) {
  // Test an FTP URL with a deep path
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char deep_path_url[] = "ftp://hostname/a/b/c/d/e.txt";
  std::string expected_result = "/a/b/c/d/e.txt";
  BOOST_CHECK_EQUAL(worker.removeOrigin(deep_path_url), expected_result);
}

BOOST_AUTO_TEST_CASE(GetAuthzPathValidPathTest) {
  // Test a valid full FTP path
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char valid_path[] = "ftp://hostname/globus/root/path/to/resource.txt";
  std::string expected_result = "/path/to/resource.txt";

  BOOST_CHECK_EQUAL(worker.getAuthzPath(valid_path), expected_result);
}

BOOST_AUTO_TEST_CASE(GetAuthzPathInvalidFTPPathTest) {
  // Test an invalid FTP path (removeOrigin will fail)
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char invalid_ftp_path[] = "http://hostname/globus/root/path/to/resource.txt";

  BOOST_CHECK_THROW(worker.getAuthzPath(invalid_ftp_path), TraceException);
}

BOOST_AUTO_TEST_CASE(GetAuthzPathInvalidPOSIXPathTest) {
  // Test an invalid POSIX path (isPathValid will fail)
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char invalid_posix_path[] = "ftp://hostname/wrong_root/path/to/resource.txt";

  BOOST_CHECK_THROW(worker.getAuthzPath(invalid_posix_path), TraceException);
}

BOOST_AUTO_TEST_CASE(GetAuthzPathRootPathTest) {
  // Test a valid full FTP path pointing to the root
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char root_path[] = "ftp://hostname/globus/root/";
  std::string expected_result = "/";

  BOOST_CHECK_EQUAL(worker.getAuthzPath(root_path), expected_result);
}

BOOST_AUTO_TEST_CASE(GetAuthzPathDeepPathTest) {
  // Test a valid full FTP path with a deep path
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char deep_path[] = "ftp://hostname/globus/root/a/b/c/d/e.txt";
  std::string expected_result = "/a/b/c/d/e.txt";

  BOOST_CHECK_EQUAL(worker.getAuthzPath(deep_path), expected_result);
}

BOOST_AUTO_TEST_CASE(ProcessResponseWithTimeout) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  SDMS::ICommunicator::Response response;
  response.time_out = true;
  BOOST_CHECK_THROW(worker.processResponse(response), TraceException);
}

BOOST_AUTO_TEST_CASE(ProcessResponseWithError) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  SDMS::ICommunicator::Response response;
  response.error = true;
  response.error_msg = "Sample error message";

  BOOST_CHECK_EQUAL(worker.processResponse(response), 1);
  // Verify that DL_ERROR was called with appropriate error message
}

BOOST_AUTO_TEST_CASE(ProcessResponseWithNullMessage) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  SDMS::ICommunicator::Response response;
  response.message = nullptr;
  response.time_out = false;
  response.error = false;

  BOOST_CHECK_THROW(worker.processResponse(response), TraceException);
  // Verify that DL_ERROR was called with the "message is not defined" error
}

BOOST_AUTO_TEST_CASE(ProcessResponseWithValidMessage) {

  SDMS::MessageFactory msg_factory;

  SDMS::ICommunicator::Response response;
  response.message =
      msg_factory.create(SDMS::MessageType::GOOGLE_PROTOCOL_BUFFER);

  std::string user_id = "hermes";
  std::string key = "skeleton";
  const uint16_t context = 1;

  response.message->set(SDMS::MessageAttribute::ID, user_id);
  response.message->set(SDMS::MessageAttribute::KEY, key);
  response.message->set(SDMS::MessageAttribute::STATE,
                        SDMS::MessageState::REQUEST);
  response.message->set(SDMS::constants::message::google::CONTEXT, context);
  auto auth_by_token_req =
      std::make_unique<SDMS::Anon::AuthenticateByTokenRequest>();
  std::string token = "golden_chest";
  auth_by_token_req->set_token(token);

  response.message->setPayload(std::move(auth_by_token_req));

  std::string route = "MtOlympia";
  response.message->addRoute(route);

  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);

  BOOST_CHECK_EQUAL(worker.processResponse(response), 0);
}

BOOST_AUTO_TEST_CASE(ProcessResponseWithNackReply) {

  SDMS::MessageFactory msg_factory;

  SDMS::ICommunicator::Response response;
  response.message =
      msg_factory.create(SDMS::MessageType::GOOGLE_PROTOCOL_BUFFER);

  std::string user_id = "hermes";
  std::string key = "skeleton";
  const uint16_t context = 1;

  response.message->set(SDMS::MessageAttribute::ID, user_id);
  response.message->set(SDMS::MessageAttribute::KEY, key);
  response.message->set(SDMS::MessageAttribute::STATE,
                        SDMS::MessageState::REQUEST);
  response.message->set(SDMS::constants::message::google::CONTEXT, context);
  auto nack = std::make_unique<SDMS::Anon::NackReply>();

  response.message->setPayload(std::move(nack));

  std::string route = "MtOlympia";
  response.message->addRoute(route);

  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // Verify that DL_DEBUG was called with "Received NACK reply" for NACK case
  BOOST_CHECK_EQUAL(worker.processResponse(response), 1);
  // Verify error occurs
}

BOOST_AUTO_TEST_SUITE_END()
