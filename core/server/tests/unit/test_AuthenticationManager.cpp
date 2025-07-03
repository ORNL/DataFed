#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE authmap

// Local includes
#include "AuthenticationManager.hpp"
#include "Condition.hpp"

// Third party includes
#include <boost/algorithm/string/predicate.hpp>
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
#include <google/protobuf/stubs/common.h>

// Standard includes
#include <map>
#include <memory>

using namespace SDMS::Core;

struct GlobalProtobufTeardown {
    ~GlobalProtobufTeardown() {
        // This is the teardown function that runs once at the end
        google::protobuf::ShutdownProtobufLibrary();
    }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);

BOOST_AUTO_TEST_SUITE(AuthenticationManagerTest)

BOOST_AUTO_TEST_CASE(testing_AuthenticationManagerPurgeTrans) {

  std::map<PublicKeyType, time_t> purge_intervals;
  purge_intervals[PublicKeyType::TRANSIENT] = 1; // Seconds

  std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>>
      purge_conditions;

  const PublicKeyType promote_from = PublicKeyType::TRANSIENT;
  const PublicKeyType promote_to = PublicKeyType::SESSION;
  const size_t promote_after_access_attemps = 2;

  auto promote_condition = std::make_unique<Promote>(
      promote_after_access_attemps, promote_from, promote_to);

  purge_conditions[PublicKeyType::TRANSIENT].push_back(
      std::move(promote_condition));

  std::string db_url = "https://db/sdms/blah";
  std::string db_user = "greatestone";
  std::string db_pass = "1234";
  std::string cred_dir = "/opt/datafed/keys";

  AuthenticationManager auth_manager(
      purge_intervals, std::move(purge_conditions), db_url, db_user, db_pass, cred_dir);

  const std::string public_key = "mercedes";
  const std::string uid = "u/benz";
  auth_manager.addKey(PublicKeyType::TRANSIENT, public_key, uid);

  BOOST_TEST(auth_manager.hasKey(public_key));
  BOOST_TEST(boost::iequals(auth_manager.getUID(public_key), uid));

  // Run purge
  auth_manager.purge(PublicKeyType::TRANSIENT);

  std::cout << "Show output" << std::endl;
  // Nothing should happen because the interval was not surpassed
  BOOST_TEST(auth_manager.hasKey(public_key));
  BOOST_TEST(boost::iequals(auth_manager.getUID(public_key), uid));

  // Sleep for the purge interval
  sleep(purge_intervals[PublicKeyType::TRANSIENT]);

  // Run purge
  auth_manager.purge(PublicKeyType::TRANSIENT);

  // Key should have been removed
  BOOST_TEST(auth_manager.hasKey(public_key) == false);
}

BOOST_AUTO_TEST_CASE(testing_AuthenticationManagerPromotePurgeSession) {

  std::map<PublicKeyType, time_t> purge_intervals;
  purge_intervals[PublicKeyType::TRANSIENT] = 1; // Seconds
  purge_intervals[PublicKeyType::SESSION] = 2;   // Seconds

  std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>>
      purge_conditions;

  const PublicKeyType promote_from = PublicKeyType::TRANSIENT;
  const PublicKeyType promote_to = PublicKeyType::SESSION;
  const size_t promote_after_access_attemps = 2;

  auto promote_condition = std::make_unique<Promote>(
      promote_after_access_attemps, promote_from, promote_to);

  purge_conditions[PublicKeyType::TRANSIENT].push_back(
      std::move(promote_condition));

  std::string db_url = "https://db/sdms/blah";
  std::string db_user = "greatestone";
  std::string db_pass = "1234";
  std::string cred_dir = "/opt/datafed/keys";

  AuthenticationManager auth_manager(
      purge_intervals, std::move(purge_conditions), db_url, db_user, db_pass, cred_dir);

  const std::string public_key = "mercedes";
  const std::string uid = "u/benz";
  auth_manager.addKey(PublicKeyType::TRANSIENT, public_key, uid);

  // Register two accesses to the public_key
  auth_manager.incrementKeyAccessCounter(public_key);
  auth_manager.incrementKeyAccessCounter(public_key);

  // Sleep for the purge interval
  sleep(purge_intervals[PublicKeyType::TRANSIENT]);

  // NOTE that the promotion will not occur until after the purge interval has
  // run
  auth_manager.purge(PublicKeyType::TRANSIENT);

  // Should still have the key becuase it was promoted to a SESSION KEY
  BOOST_TEST(auth_manager.hasKey(public_key));

  // Nothing should happen at this point because the SESSION key is fresh
  auth_manager.purge(PublicKeyType::SESSION);
  BOOST_TEST(auth_manager.hasKey(public_key));
}

BOOST_AUTO_TEST_CASE(testing_AuthenticationManagerSessionReset) {

  std::map<PublicKeyType, time_t> purge_intervals;
  purge_intervals[PublicKeyType::SESSION] = 2; // Seconds

  std::map<PublicKeyType, std::vector<std::unique_ptr<Condition>>>
      purge_conditions;

  const PublicKeyType apply_reset_to = PublicKeyType::SESSION;
  const size_t reset_after_access_attempts = 1;

  auto reset_condition =
      std::make_unique<Reset>(reset_after_access_attempts, apply_reset_to);

  purge_conditions[PublicKeyType::SESSION].push_back(
      std::move(reset_condition));

  std::string db_url = "https://db/sdms/blah";
  std::string db_user = "greatestone";
  std::string db_pass = "1234";
  std::string cred_dir = "/opt/datafed/keys";

  AuthenticationManager auth_manager(
      purge_intervals, std::move(purge_conditions), db_url, db_user, db_pass, cred_dir);

  const std::string public_key = "mercedes";
  const std::string uid = "u/benz";
  auth_manager.addKey(PublicKeyType::SESSION, public_key, uid);

  BOOST_TEST(auth_manager.hasKey(public_key));
  BOOST_TEST(boost::iequals(auth_manager.getUID(public_key), uid));

  // Register one accesses to the public_key
  auth_manager.incrementKeyAccessCounter(public_key);

  // Sleep for the purge interval
  sleep(purge_intervals[PublicKeyType::SESSION]);

  // NOTE that the reset will not occur until after the purge interval has
  // run
  auth_manager.purge(PublicKeyType::SESSION);

  // Should still have the key becuase it was reset
  BOOST_TEST(auth_manager.hasKey(public_key));

  // Nothing should happen at this point because the SESSION key is fresh
  auth_manager.purge(PublicKeyType::SESSION);
  BOOST_TEST(auth_manager.hasKey(public_key));

  // Sleep for the purge interval of the SESSION
  sleep(purge_intervals[PublicKeyType::SESSION]);

  auth_manager.purge(PublicKeyType::SESSION);
  BOOST_TEST(auth_manager.hasKey(public_key) == false);
}

BOOST_AUTO_TEST_SUITE_END()
