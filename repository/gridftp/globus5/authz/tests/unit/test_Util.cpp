#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE getVersion
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

extern "C" {
#include "Util.h"
}

BOOST_AUTO_TEST_SUITE(util)

// uuidToStr Valid UUID Conversion
BOOST_AUTO_TEST_CASE(ValidUuidConversion) {
  unsigned char uuid[16] = {0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef,
                            0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef};
  char output[37]; // UUID string length + null terminator
  uuidToStr(uuid, output);

  BOOST_CHECK_EQUAL(std::string(output),
                    "12345678-90ab-cdef-1234-567890abcdef");
}

// uuidToStr Empty UUID
BOOST_AUTO_TEST_CASE(EmptyUuid) {
  unsigned char uuid[16] = {0};
  char output[37];
  uuidToStr(uuid, output);

  BOOST_CHECK_EQUAL(std::string(output),
                    "00000000-0000-0000-0000-000000000000");
}

// uuidToStr Max UUID
BOOST_AUTO_TEST_CASE(MaxUuid) {
  unsigned char uuid[16] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
  char output[37];
  uuidToStr(uuid, output);

  BOOST_CHECK_EQUAL(std::string(output),
                    "ffffffff-ffff-ffff-ffff-ffffffffffff");
}

// uuidToStr Random UUID
BOOST_AUTO_TEST_CASE(RandomUuid) {
  unsigned char uuid[16] = {0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe,
                            0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe};
  char output[37];
  uuidToStr(uuid, output);

  BOOST_CHECK_EQUAL(std::string(output),
                    "deadbeef-cafe-babe-dead-beefcafebabe");
}

BOOST_AUTO_TEST_CASE(TestValidInput) {
  char output[37];
  output[0] = '\0';

  // decodeUUID Test with valid Base32 encoded input
  BOOST_CHECK(decodeUUID("mzxw6ytbpiqgsxu6zt4jq5diiy", output));
  BOOST_CHECK_EQUAL(strlen(output), 36);
  BOOST_CHECK_EQUAL(output[8], '-'); // Check canonical UUID format
  BOOST_CHECK_EQUAL(output[13], '-');
  BOOST_CHECK_EQUAL(output[18], '-');
  BOOST_CHECK_EQUAL(output[23], '-');
}

BOOST_AUTO_TEST_CASE(TestInvalidCharacter) {
  char output[37];

  // decodeUUID Test with invalid character in input
  BOOST_CHECK(!decodeUUID("mzxw6ytbpiqg8xu6zt4jq5diiy", output));
}

BOOST_AUTO_TEST_CASE(TestEmptyInput) {
  char output[37];

  // decodeUUID Test with empty input string
  BOOST_CHECK(!decodeUUID("", output));
}

BOOST_AUTO_TEST_SUITE_END()
