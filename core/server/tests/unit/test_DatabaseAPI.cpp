#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE databaseapi

#include "Config.hpp"
#include "DatabaseAPI.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/libjson.hpp"

// Third party includes
#include <boost/algorithm/string/predicate.hpp>
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
#include <curl/curl.h>

// Standard includes
#include <map>
#include <memory>
#include <string>
#include <vector>

using namespace libjson;
using namespace SDMS;
using namespace SDMS::Core;

class TestDatabaseAPI : public DatabaseAPI {
public:
  TestDatabaseAPI(const std::string &a_db_url, const std::string &a_db_user,
                  const std::string &a_db_pass)
      : DatabaseAPI(a_db_url, a_db_user, a_db_pass) {}

  ~TestDatabaseAPI() {}

  static TestDatabaseAPI create() {
    return TestDatabaseAPI(
      "https://restful-booker.herokuapp.com/",
      "user",
      "password"
    );
  }

  long dbGet(const char *a_url_path,
             const std::vector<std::pair<std::string, std::string>> &a_params,
             libjson::Value &a_result, LogContext log_context,
             bool a_log = true) {
    return DatabaseAPI::dbGet(a_url_path, a_params, a_result, log_context,
                              a_log);
  }

  bool dbGetRaw(const char *a_url_path,
           const std::vector<std::pair<std::string, std::string>> &a_params,
           std::string &a_result) {
    return DatabaseAPI::dbGetRaw(a_url_path, a_params, a_result);
  }

  long dbPost(const char *a_url_path,
              const std::vector<std::pair<std::string, std::string>> &a_params,
              const std::string *a_body, libjson::Value &a_result,
              LogContext log_context) {
    return DatabaseAPI::dbPost(a_url_path, a_params, a_body, a_result,
                               log_context);
  }
};

BOOST_AUTO_TEST_SUITE(DatabaseAPITest)

BOOST_AUTO_TEST_CASE(testing_DatabaseAPIPost) {
  TestDatabaseAPI api = TestDatabaseAPI::create();
  LogContext log_context;
  Value res;
  std::string body = "{\"username\":\"admin\",\"password\":\"password123\"}";

  api.dbPost("auth", {{"field", "test"}}, &body, res, log_context);

  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(testing_DatabaseAPIGet) {
  TestDatabaseAPI api = TestDatabaseAPI::create();
  LogContext log_context;
  Value res;

  api.dbGet("booking", {{"field", "test"}}, res, log_context);

  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(testing_DatabaseAPIGetRaw) {
  TestDatabaseAPI api = TestDatabaseAPI::create();
  std::string res;

  api.dbGetRaw("booking", {{"field", "test"}}, res);

  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()
