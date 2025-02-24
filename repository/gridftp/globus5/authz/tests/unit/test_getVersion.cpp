#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE getVersion
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

#include "Version.hpp"

extern "C" {
#include "AuthzWorker.h"
}

BOOST_AUTO_TEST_SUITE(get_version)

BOOST_AUTO_TEST_CASE(test_get_version) {
  // Simulate expected version from SDMS::authz::version
  const int expected_major = SDMS::authz::version::MAJOR;
  const int expected_minor = SDMS::authz::version::MINOR;
  const int expected_patch = SDMS::authz::version::PATCH;

  // Construct the expected version string
  std::string expected_version = std::to_string(expected_major) + "." +
                                 std::to_string(expected_minor) + "." +
                                 std::to_string(expected_patch);

  // Call the function and verify the result
  BOOST_CHECK_EQUAL(std::string(getVersion()), expected_version);
}

BOOST_AUTO_TEST_SUITE_END()
