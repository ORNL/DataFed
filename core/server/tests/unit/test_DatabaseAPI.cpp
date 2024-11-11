#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE databaseapi

#include "DatabaseAPI.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/libjson.hpp"

// Third party includes
#include <curl/curl.h>
#include <boost/algorithm/string/predicate.hpp>
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Standard includes
#include <memory>
#include <string>
#include <vector>
#include <map>

using namespace SDMS::Core;

class TestDatabaseAPI: public DatabaseAPI {
public:
  TestDatabaseAPI(const std::string &a_db_url, const std::string &a_db_user,
              const std::string &a_db_pass);
  ~TestDatabaseAPI();

  long dbGet(const char *a_url_path,
             const std::vector<std::pair<std::string, std::string>> &a_params,
             libjson::Value &a_result, LogContext, bool a_log = true);
  bool
  dbGetRaw(const char *a_url_path,
           const std::vector<std::pair<std::string, std::string>> &a_params,
           std::string &a_result);
  long dbPost(const char *a_url_path,
              const std::vector<std::pair<std::string, std::string>> &a_params,
              const std::string *a_body, libjson::Value &a_result, LogContext);
};

BOOST_AUTO_TEST_SUITE(DatabaseAPITest)

BOOST_AUTO_TEST_CASE(testing_DatabaseAPIPost) {
    BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(testing_DatabaseAPIGet) {
    BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()
