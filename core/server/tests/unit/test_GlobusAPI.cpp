#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE globusapi

// Local private includes
#include "GlobusAPI.hpp"
// #include "Config.hpp"

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

using namespace libjson;
using namespace SDMS::Core;

class TestGlobusAPI: public GlobusAPI {
public:
  TestGlobusAPI() {}

  ~TestGlobusAPI() {}

  void setupConfig() {
    
  }
  
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

CURL* curl_setup() {
    CURL* m_curl = curl_easy_init();
    if (!m_curl)
        EXCEPT(1, "libcurl init failed");

    curl_easy_setopt(m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
    // curl_easy_setopt(m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB);
    curl_easy_setopt(m_curl, CURLOPT_SSL_VERIFYPEER, 0);
    curl_easy_setopt(m_curl, CURLOPT_TCP_NODELAY, 1);
}

BOOST_AUTO_TEST_SUITE(GlobusAPITest)

BOOST_AUTO_TEST_CASE(testing_GlobusAPIPost) {
    TestGlobusAPI api;
    api.setupConfig();
    CURL* m_curl = curl_setup();
    Value body;
    Value::Object &body_o = body.initObject();
    body_o["username"] = "admin";
    body_o["password"] = "password123";
    std::string res;

    api.post(m_curl, "https://restful-booker.herokuapp.com/", "auth", "", {{"field","test"}}, &body, res);

    BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(testing_GlobusAPIGet) {
    TestGlobusAPI api;
    api.setupConfig();
    CURL* m_curl = curl_setup();
    std::string res;

    api.get(m_curl, "https://restful-booker.herokuapp.com/", "booking", "authtoken", {{"field","test"}}, res);

    BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()
