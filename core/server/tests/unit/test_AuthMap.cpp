#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE authmap
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "AuthMap.hpp"

// Third party includes
#include <google/protobuf/stubs/common.h>

using namespace SDMS::Core;

struct GlobalProtobufTeardown {
  ~GlobalProtobufTeardown() {
    // This is the teardown function that runs once at the end
    google::protobuf::ShutdownProtobufLibrary();
  }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);

BOOST_AUTO_TEST_SUITE(AuthMapTest)

BOOST_AUTO_TEST_CASE(testing_AuthMap) {
  time_t active_transient_key_time = 30;
  time_t active_session_key_time = 30;
  std::string db_url = "https://db/sdms/blah";
  std::string db_user = "greatestone";
  std::string db_pass = "1234";

  AuthMap auth_map(active_transient_key_time, active_session_key_time, db_url,
                   db_user, db_pass);

  BOOST_TEST(auth_map.size(PublicKeyType::TRANSIENT) == 0);
  std::string new_pub_key = "ugh";
  std::string user_id = "u/bob";
  auth_map.addKey(PublicKeyType::TRANSIENT, new_pub_key, user_id);
  BOOST_TEST(auth_map.size(PublicKeyType::TRANSIENT) == 1);

  BOOST_TEST(auth_map.hasKey(PublicKeyType::TRANSIENT, new_pub_key));
  BOOST_TEST(auth_map.hasKey(PublicKeyType::SESSION, new_pub_key) == false);
  BOOST_TEST(auth_map.hasKey(PublicKeyType::PERSISTENT, new_pub_key) == false);

  BOOST_TEST(auth_map.getUID(PublicKeyType::TRANSIENT, new_pub_key) == user_id);
}

BOOST_AUTO_TEST_CASE(testing_AuthMap_setgetcount) {
  time_t active_transient_key_time = 30;
  time_t active_session_key_time = 30;
  std::string db_url = "https://db/sdms/blah";
  std::string db_user = "greatestone";
  std::string db_pass = "1234";

  AuthMap auth_map(active_transient_key_time, active_session_key_time, db_url,
                   db_user, db_pass);

  BOOST_TEST(auth_map.size(PublicKeyType::TRANSIENT) == 0);

  std::string new_pub_key = "ugh";
  std::string user_id = "u/bob";
  auth_map.addKey(PublicKeyType::TRANSIENT, new_pub_key, user_id);

  BOOST_TEST(auth_map.getAccessCount(PublicKeyType::TRANSIENT, new_pub_key) ==
             0);

  auth_map.setAccessCount(PublicKeyType::TRANSIENT, new_pub_key, 5);

  BOOST_TEST(auth_map.getAccessCount(PublicKeyType::TRANSIENT, new_pub_key) ==
             5);
}

BOOST_AUTO_TEST_SUITE_END()
