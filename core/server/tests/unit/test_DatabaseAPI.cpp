#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE authmap

// Local includes
#include "DatabaseAPI.hpp"

// Third party includes
#include <boost/algorithm/string/predicate.hpp>
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
#include <curl/curl.h>
#include <google/protobuf/stubs/common.h>
#include <nlohmann/json.hpp>

// Standard includes
#include <iostream>
#include <map>
#include <memory>

using namespace SDMS::Core;

class DatabaseAPITestHelper : public DatabaseAPI {
public:
  // Inherit constructor(s) from DatabaseAPI
  using DatabaseAPI::DatabaseAPI;

  // Or you can just use protected methods directly in your own logic
  std::string newJsonMetricParse(
      uint32_t ts, uint32_t total,
      const std::map<std::string, std::map<uint16_t, uint32_t>> &metrics) {
    return DatabaseAPI::newJsonMetricParse(ts, total,
                                           metrics); // if it's protected
  }
};

struct CurlGlobalFixture {
  CurlGlobalFixture() { curl_global_init(CURL_GLOBAL_DEFAULT); }

  ~CurlGlobalFixture() { curl_global_cleanup(); }
};

// Register fixture to run once per test module
BOOST_TEST_GLOBAL_CONFIGURATION(CurlGlobalFixture);

const std::string url("https://localhost:8529");
const std::string user("bob");
const std::string pass("open_sesame");

BOOST_AUTO_TEST_SUITE(DatabaseAPITest)

/**
 * @brief Unit test for DatabaseAPI::newJsonMetricParse() with empty metrics.
 *
 * This test verifies that the `newJsonMetricParse` function correctly handles
 * the case where the metrics map is empty.
 *
 * Test details:
 * - The `metrics` map is empty (no users or messages).
 * - The function is called with a timestamp and total value.
 * - The test asserts that the JSON output contains the correct timestamp,
 *   total, and an empty "uids" object.
 *
 * Example of expected JSON structure:
 * @code
 * {
 *   "timestamp": 123456,
 *   "total": 42,
 *   "uids": {}
 * }
 * @endcode
 *
 * Notes:
 * - Ensures that `newJsonMetricParse` does not fail or throw exceptions
 *   when no user metrics are provided.
 * - Uses DatabaseAPITestHelper to invoke the function.
 * - Uses nlohmann::json to build and compare the expected JSON output.
 */
BOOST_AUTO_TEST_CASE(testing_empty_metrics) {

  DatabaseAPITestHelper db_api(url, user, pass);

  std::map<std::string, std::map<uint16_t, uint32_t>> metrics;

  std::string result = db_api.newJsonMetricParse(123456, 42, metrics);

  std::cout << "Result is " << std::endl;
  std::cout << result << std::endl;

  nlohmann::json expected;
  expected["timestamp"] = 123456;
  expected["total"] = 42;
  expected["uids"] = nlohmann::json::object();

  std::cout << "expected dump" << std::endl;
  std::cout << expected.dump(-1, ' ', true) << std::endl;
  BOOST_TEST(result == expected.dump(-1, ' ', true));
}

/**
 * @brief Unit test for DatabaseAPI::newJsonMetricParse() with a single user.
 *
 * This test verifies that the `newJsonMetricParse` function correctly converts
 * a metrics map containing a single user into the expected JSON format.
 *
 * Test details:
 * - One user is included: "user1".
 * - The user has a "tot" value (total) and a "msg" object containing
 *   message IDs mapped to counts.
 * - The total across all messages is passed as `total` to the function.
 * - The test asserts that the JSON output matches the expected structure.
 *
 * Example of expected JSON structure:
 * @code
 * {
 *   "timestamp": 111,
 *   "total": 5,
 *   "uids": {
 *     "user1": {
 *       "tot": 15,
 *       "msg": {
 *         "1": 10,
 *         "2": 5
 *       }
 *     }
 *   }
 * }
 * @endcode
 *
 * Notes:
 * - Keys inside the "msg" object must be strings to avoid being interpreted
 *   as JSON arrays by nlohmann::json.
 * - Uses DatabaseAPITestHelper to invoke `newJsonMetricParse`.
 * - Uses nlohmann::json to build and compare expected JSON output.
 */
BOOST_AUTO_TEST_CASE(testing_single_uid_with_tot_and_msg) {

  DatabaseAPITestHelper db_api(url, user, pass);

  std::map<std::string, std::map<uint16_t, uint32_t>> metrics = {
      {"user1", {{0, 15}, {1, 10}, {2, 5}}}};

  std::string result = db_api.newJsonMetricParse(111, 5, metrics);

  nlohmann::json expected;
  expected["timestamp"] = 111;
  expected["total"] = 5;
  nlohmann::json uids;
  // NOTE keys must be strings
  uids["user1"] = {{"tot", 15}, {"msg", {{"1", 10}, {"2", 5}}}};
  expected["uids"] = uids;

  std::cout << "result" << std::endl;
  std::cout << result << std::endl;

  std::cout << "expected" << std::endl;
  std::cout << expected.dump(-1, ' ', true) << std::endl;
  BOOST_TEST(result == expected.dump(-1, ' ', true));
}

/**
 * @brief Unit test for DatabaseAPI::newJsonMetricParse() with multiple users.
 *
 * This test verifies that the `newJsonMetricParse` function correctly converts
 * a metrics map containing multiple users into the expected JSON format.
 *
 * Test details:
 * - Two users are included: "userA" and "userB".
 * - Each user has a "tot" value (total) and a "msg" object containing
 *   message IDs mapped to counts.
 * - The total across all users is passed as `total` to the function.
 * - The test asserts that the JSON output matches the expected structure.
 *
 * Example of expected JSON structure:
 * @code
 * {
 *   "timestamp": 999,
 *   "total": 351,
 *   "uids": {
 *     "userA": { "tot": 201, "msg": {"1": 200, "4": 1} },
 *     "userB": { "tot": 150, "msg": {"2": 150} }
 *   }
 * }
 * @endcode
 *
 * Uses:
 * - DatabaseAPITestHelper for invoking `newJsonMetricParse`.
 * - nlohmann::json for building and comparing expected JSON output.
 */
BOOST_AUTO_TEST_CASE(testing_multiple_uids) {
  DatabaseAPITestHelper db_api(url, user, pass);

  std::map<std::string, std::map<uint16_t, uint32_t>> metrics = {
      {"userA", {{0, 201}, {1, 200}, {4, 1}}}, {"userB", {{0, 150}, {2, 150}}}};

  std::string result = db_api.newJsonMetricParse(999, 351, metrics);

  nlohmann::json expected;
  expected["timestamp"] = 999;
  expected["total"] = 351;
  nlohmann::json uids;
  uids["userA"] = {{"tot", 201}, {"msg", {{"1", 200}, {"4", 1}}}};
  uids["userB"] = {{"tot", 150}, {"msg", {{"2", 150}}}};
  expected["uids"] = uids;

  std::cout << "result" << std::endl;
  std::cout << result << std::endl;

  std::cout << "expected" << std::endl;
  std::cout << expected.dump(-1, ' ', true) << std::endl;

  BOOST_TEST(result == expected.dump(-1, ' ', true));
}

BOOST_AUTO_TEST_SUITE_END()
