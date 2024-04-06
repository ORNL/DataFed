#include <stdio.h>
#include <string.h>

#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE buffer
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

#include "URL.h"

BOOST_AUTO_TEST_SUITE(BufferTest)

BOOST_AUTO_TEST_CASE(test_1_ftpExtractRelativePath) {
  char relative_path[100]; // Adjust the buffer size as needed
  const char *url1 = "ftp://domain/relative_path";

  int rv = ftpExtractRelativePath(url1, relative_path, sizeof(relative_path));
  // Should pass
  BOOST_CHECK(strcmp(relative_path, "/relative_path") == 0);
  BOOST_CHECK(rv == 1);
}

BOOST_AUTO_TEST_CASE(test_2_ftpExtractRelativePath) {
  char relative_path[100]; // Adjust the buffer size as needed
  const char *url = "ftp://domain";

  int rv = ftpExtractRelativePath(url, relative_path, sizeof(relative_path));
  // Should not throw an error
  BOOST_CHECK(rv == 1);
  BOOST_CHECK(strcmp(relative_path, "/") == 0);
}

BOOST_AUTO_TEST_CASE(test_3_ftpExtractRelativePath) {
  char relative_path[100]; // Adjust the buffer size as needed
  const char *url = "";

  int rv = ftpExtractRelativePath(url, relative_path, sizeof(relative_path));
  // Should throw an error
  BOOST_CHECK(rv == 0);
}

BOOST_AUTO_TEST_CASE(test_4_ftpExtractRelativePath) {
  char relative_path[100]; // Adjust the buffer size as needed
  const char *url = "ftp:///";

  int rv = ftpExtractRelativePath(url, relative_path, sizeof(relative_path));
  // Should throw an error
  BOOST_CHECK(rv == 0);
}

BOOST_AUTO_TEST_CASE(test_5_ftpExtractRelativePath) {
  char relative_path[100]; // Adjust the buffer size as needed
  const char *url = "ftp:/domain///path";

  int rv = ftpExtractRelativePath(url, relative_path, sizeof(relative_path));
  // Should throw an error because prefix is incorrect
  BOOST_CHECK(rv == 0);
}

BOOST_AUTO_TEST_CASE(test_6_ftpExtractRelativePath) {
  char relative_path[100]; // Adjust the buffer size as needed
  const char *url = "ftp://domain///path";

  int rv = ftpExtractRelativePath(url, relative_path, sizeof(relative_path));
  // Should not throw an error
  BOOST_CHECK(rv == 1);
  printf("Relative path is %s\n", relative_path);
  BOOST_CHECK(strcmp(relative_path, "///path") == 0);
}

BOOST_AUTO_TEST_CASE(test_1_comparePrefix) {
  const char *allowed_prefix = "/mnt/storage/globus";
  size_t prefix_len = strlen(allowed_prefix);
  const char *relative_path = "";
  int rv = comparePrefix(allowed_prefix, relative_path, prefix_len);

  // Should fail
  BOOST_CHECK(rv != 0);
}

BOOST_AUTO_TEST_CASE(test_2_comparePrefix) {
  const char *allowed_prefix = "/mnt/storage/globus";
  size_t prefix_len = strlen(allowed_prefix);
  const char *relative_path = "/";
  int rv = comparePrefix(allowed_prefix, relative_path, prefix_len);

  // Should fail
  BOOST_CHECK(rv != 0);
}

BOOST_AUTO_TEST_CASE(test_3_comparePrefix) {
  const char *allowed_prefix = "/mnt/storage/globus";
  size_t prefix_len = strlen(allowed_prefix);
  const char *relative_path = "/mnt/storage/globus/";
  int rv = comparePrefix(allowed_prefix, relative_path, prefix_len);

  // Should pass
  BOOST_CHECK(rv == 0);
}

BOOST_AUTO_TEST_CASE(test_4_comparePrefix) {
  const char *allowed_prefix = "/mnt/storage/globus";
  size_t prefix_len = strlen(allowed_prefix);
  const char *relative_path = "/mnt/storage/globus";
  int rv = comparePrefix(allowed_prefix, relative_path, prefix_len);

  // Should pass
  BOOST_CHECK(rv == 0);
}

BOOST_AUTO_TEST_CASE(test_5_comparePrefix) {
  const char *allowed_prefix = "/mnt/storage/globus";
  size_t prefix_len = strlen(allowed_prefix);
  const char *relative_path = "/mnt/storage/globu";
  int rv = comparePrefix(allowed_prefix, relative_path, prefix_len);

  // Should fail
  BOOST_CHECK(rv != 0);
}

BOOST_AUTO_TEST_SUITE_END()
