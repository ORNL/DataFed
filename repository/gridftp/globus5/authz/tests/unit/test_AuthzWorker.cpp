#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE AuthzWorker
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Private includes
#include "AuthzWorker.hpp"

// Third party includes
#include <google/protobuf/stubs/common.h>

// Public includes
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/IMessage.hpp"
#include "common/MessageFactory.hpp"
#include "common/envelope.pb.h"
#include "common/TraceException.hpp"

// Standard includes
#include <cstring>
#include <string>

extern "C" {
#include "Config.h"
}

class ConfigFixture {
public:
  // Setup: create the object before each test case
  // The below settings are simply for testing and are not
  // used in anyway in a production environment.
  ConfigFixture() {
    // Mirror loadConfig(): zero the whole struct so every field starts empty.
    std::memset(&config, 0, sizeof(config));
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

struct GlobalProtobufTeardown {
    ~GlobalProtobufTeardown() {
        // This is the teardown function that runs once at the end
        google::protobuf::ShutdownProtobufLibrary();
    }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);

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
  // No test path configured
  SDMS::AuthzWorker worker(&config, log_context);

  // Without a test path, nothing should match
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

BOOST_AUTO_TEST_CASE(InvalidPathPartialComponentTest) {
  // A sibling directory sharing a character prefix with the collection root
  // is NOT inside the collection. Fails until isPathValid requires '/' or
  // end-of-string immediately after the root prefix.
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  std::string sibling_path = "/globus/rootkit/file.txt";
  BOOST_CHECK(worker.isPathValid(sibling_path) == false);
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

BOOST_AUTO_TEST_CASE(GetAuthzPathRootPathNoTrailingSlashTest) {
  // The collection root without a trailing slash yields the EMPTY string.
  // isRepoAncestor() depends on treating "" as the collection root.
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  char root_path[] = "ftp://hostname/globus/root";
  std::string expected_result = "";

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
}

BOOST_AUTO_TEST_CASE(ProcessResponseWithNullMessage) {
  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  SDMS::ICommunicator::Response response;
  response.message = nullptr;
  response.time_out = false;
  response.error = false;

  BOOST_CHECK_THROW(worker.processResponse(response), TraceException);
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
      std::make_unique<SDMS::AuthenticateByTokenRequest>();
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
  auto nack = std::make_unique<SDMS::NackReply>();

  response.message->setPayload(std::move(nack));

  std::string route = "MtOlympia";
  response.message->addRoute(route);

  SDMS::LogContext log_context;
  SDMS::AuthzWorker worker(&config, log_context);
  // A NACK from the core is an authorization denial: processResponse
  // returns 1 (and logs the NACK's reason).
  BOOST_CHECK_EQUAL(worker.processResponse(response), 1);
}

// ---------------------------------------------------------------------------
// isRepoAncestor
//
// NOTE: name retained for compatibility; semantics are now "is the collection
// root". It operates on COLLECTION-RELATIVE paths (the output of
// getAuthzPath()), never on raw FTP URLs. The collection root is the ONLY
// path decided locally — the callout has no knowledge of repo layout.
// Everything below the root is forwarded to the core, which resolves the
// owning repo from the collection-relative path (repo.path).
// ---------------------------------------------------------------------------

// Collection root "/" (the dev environment: globus-collection-path=/).
BOOST_AUTO_TEST_CASE(IsRepoAncestor_RootIsSlash) {
  SDMS::LogContext log_context;
  std::strcpy(config.globus_collection_path, "/");
  SDMS::AuthzWorker worker(&config, log_context);

  char url_root[] = "ftp://host_name/";
  BOOST_CHECK(worker.isRepoAncestor(worker.getAuthzPath(url_root)));

  // Below the root: always the core's decision, however ancestor-like.
  char url_mnt[] = "ftp://host_name/mnt";
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_mnt)));

  char url_base[] = "ftp://host_name/mnt/collection_root/";
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_base)));

  char url_repo[] = "ftp://host_name/mnt/collection_root/repo_id";
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_repo)));

  char url_record[] = "ftp://host_name/mnt/collection_root/repo_id/user/u1/f";
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_record)));
}

// Real collection root path.
BOOST_AUTO_TEST_CASE(IsRepoAncestor_RealCollectionPath) {
  SDMS::LogContext log_context;
  std::strcpy(config.globus_collection_path, "/mnt/collection_root");
  SDMS::AuthzWorker worker(&config, log_context);

  // getAuthzPath() yields "" (no trailing slash) or "/" (trailing slash)
  // for the collection root; both are the root.
  char url_root[] = "ftp://host_name/mnt/collection_root";
  BOOST_CHECK_EQUAL(worker.getAuthzPath(url_root), "");
  BOOST_CHECK(worker.isRepoAncestor(worker.getAuthzPath(url_root)));

  char url_root_slash[] = "ftp://host_name/mnt/collection_root/";
  BOOST_CHECK_EQUAL(worker.getAuthzPath(url_root_slash), "/");
  BOOST_CHECK(worker.isRepoAncestor(worker.getAuthzPath(url_root_slash)));

  // Repo directly under the root, and nested one level deeper: both core.
  char url_repo[] = "ftp://host_name/mnt/collection_root/repo_id";
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_repo)));

  char url_nested[] =
      "ftp://host_name/mnt/collection_root/relative_path_in_coll/repo_id";
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_nested)));

  char url_intermediate[] =
      "ftp://host_name/mnt/collection_root/relative_path_in_coll";
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_intermediate)));
}

// Regression guard: repo_id must play no part in the local decision.
// (Multiple repos may be served by one endpoint; the core resolves the repo.)
BOOST_AUTO_TEST_CASE(IsRepoAncestor_IndependentOfRepoId) {
  SDMS::LogContext log_context;
  std::strcpy(config.globus_collection_path, "/mnt/collection_root");
  char url_root[] = "ftp://host_name/mnt/collection_root/";
  char url_repo[] = "ftp://host_name/mnt/collection_root/repo_id";

  for (const char *id : {"repo/repo_id", "repo_id", "repo/other_repo"}) {
    std::strcpy(config.repo_id, id);
    SDMS::AuthzWorker worker(&config, log_context);
    BOOST_CHECK(worker.isRepoAncestor(worker.getAuthzPath(url_root)));
    BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_repo)));
  }
}

// Paths above or outside the collection root never reach isRepoAncestor:
// getAuthzPath() rejects them. GCS confines requests to the collection, so
// these only occur on misconfiguration — a hard failure is correct.
BOOST_AUTO_TEST_CASE(GetAuthzPath_OutsideCollectionRootThrows) {
  SDMS::LogContext log_context;
  std::strcpy(config.globus_collection_path, "/mnt/collection_root");
  SDMS::AuthzWorker worker(&config, log_context);

  char url_above[] = "ftp://host_name/mnt";
  BOOST_CHECK_THROW(worker.getAuthzPath(url_above), TraceException);

  char url_outside[] = "ftp://host_name/repo_id";
  BOOST_CHECK_THROW(worker.getAuthzPath(url_outside), TraceException);

  // Sibling sharing a character prefix with the root. Fails until
  // isPathValid() matches whole path components.
  char url_sibling[] = "ftp://host_name/mnt/collection_root_evil/file";
  BOOST_CHECK_THROW(worker.getAuthzPath(url_sibling), TraceException);
}

// Raw FTP URLs (pre-sanitization coordinates) must never produce a local
// allow — the bug of placing the check in libauthz.c against the raw object.
BOOST_AUTO_TEST_CASE(IsRepoAncestor_RawURLNeverAllowed) {
  SDMS::LogContext log_context;
  std::strcpy(config.globus_collection_path, "/");
  SDMS::AuthzWorker worker(&config, log_context);

  BOOST_CHECK(!worker.isRepoAncestor("ftp://host_name/"));
  BOOST_CHECK(!worker.isRepoAncestor("ftp://host_name/mnt"));
}

// A trailing slash on globus-collection-path must not shift the
// collection-relative coordinates sent to the core.
BOOST_AUTO_TEST_CASE(GetAuthzPath_TrailingSlashOnCollectionPath) {
  SDMS::LogContext log_context;
  std::strcpy(config.globus_collection_path, "/mnt/collection_root/");
  SDMS::AuthzWorker worker(&config, log_context);

  char url_root[] = "ftp://host_name/mnt/collection_root/";
  BOOST_CHECK(worker.isRepoAncestor(worker.getAuthzPath(url_root)));

  char url_repo[] = "ftp://host_name/mnt/collection_root/repo_id";
  BOOST_CHECK_EQUAL(worker.getAuthzPath(url_repo), "/repo_id");
  BOOST_CHECK(!worker.isRepoAncestor(worker.getAuthzPath(url_repo)));
}

BOOST_AUTO_TEST_SUITE_END()
