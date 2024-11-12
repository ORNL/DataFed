#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE globusapi

// Local private includes
#include "GlobusAPI.hpp"
#include "Config.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/libjson.hpp"

// Third party includes
#include <curl/curl.h>
#include <boost/algorithm/string/predicate.hpp>
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Standard includes
#include <string>
#include <vector>
#include <map>
#include <memory>

using namespace SDMS::Core;

class TestGlobusAPI: public GlobusAPI {
public:
  TestGlobusAPI() {
    GlobusAPI::init()
  }

  ~TestGlobusAPI() {}
  
  long get(CURL *a_curl, const std::string &a_base_url,
           const std::string &a_url_path, const std::string &a_token,
           const std::vector<std::pair<std::string, std::string>> &a_params,
           std::string &a_result) {
        return GlobusAPI::get(a_curl, a_base_url, a_url_path, a_token, a_params, a_result);
    }
    
  long post(CURL *a_curl, const std::string &a_base_url,
            const std::string &a_url_path, const std::string &a_token,
            const std::vector<std::pair<std::string, std::string>> &a_params,
            const libjson::Value *a_body, std::string &a_result) {
        return GlobusAPI::post(a_curl, a_base_url, a_url_path, a_token, a_params, a_body, a_result);
    }
};

BOOST_AUTO_TEST_SUITE(GlobusAPITest)

BOOST_AUTO_TEST_CASE(testing_GlobusAPIPost) {
    Config config = Config::getInstance();
    TestGlobusAPI api();
    BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(testing_GlobusAPIGet) {
    Config config = Config::getInstance();
    TestGlobusAPI api();
    BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()
