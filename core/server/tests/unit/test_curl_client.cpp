
// Local DataFed includes
#include "curl_client.hpp"

// Public DataFed includes
#include <passkey.hpp>
#include <test.hpp>

#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE http_curl_client
#include <boost/test/unit_test.hpp>

using namespace datafed;

BOOST_AUTO_TEST_SUITE(http_curl_client ) 

BOOST_AUTO_TEST_CASE( http_curl_client_1 ) {
  Test test;
  CURLHTTPClient curl_client(test.key());
  BOOST_CHECK( curl_client.type() == PROTOCOL_TYPE::HTTP );
}


BOOST_AUTO_TEST_SUITE_END() 
