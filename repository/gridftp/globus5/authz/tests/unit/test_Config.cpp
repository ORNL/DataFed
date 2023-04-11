#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE buffer
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "Buffer.hpp"
#include "ProtoBufFactory.hpp"
#include "ProtoBufMap.hpp"

// Standard includes
#include <iostream>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(ConfigTest)

BOOST_AUTO_TEST_CASE( testing_Config ) {

  Buffer buffer;

  BOOST_CHECK(buffer.size() == 0);
  BOOST_CHECK(buffer.maxSize() == MEGABYTE);
  BOOST_CHECK(buffer.capacity() == 0);
  BOOST_CHECK(buffer.toString().empty());

}
BOOST_AUTO_TEST_SUITE_END()

