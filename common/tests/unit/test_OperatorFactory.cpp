#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE operator_factory
#include <boost/test/unit_test.hpp>

// Local public includes
#include "common/IAuthenticationManager.hpp"
#include "common/IMessage.hpp"
#include "common/IOperator.hpp"
#include "common/MessageFactory.hpp"
#include "common/OperatorFactory.hpp"
#include "common/OperatorTypes.hpp"

// Third party includes
#include <google/protobuf/stubs/common.h>

// Standard includes
#include <iostream>
#include <string>
#include <unordered_map>

using namespace SDMS;

struct GlobalProtobufTeardown {
    ~GlobalProtobufTeardown() {
        // This is the teardown function that runs once at the end
        google::protobuf::ShutdownProtobufLibrary();
    }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);

class DummyAuthManager : public IAuthenticationManager {
private:
  std::unordered_map<std::string, int> m_counters;

  /**
   * Methods only available via the interface
   **/
  virtual void incrementKeyAccessCounter(const std::string &pub_key) final {
    ++m_counters.at(pub_key);
  }

  virtual bool hasKey(const std::string &pub_key) const {
    return m_counters.count(pub_key);
  }
  // Just assume all keys map to the anon_uid
  virtual std::string getUID(const std::string &) const {
    return "authenticated_uid";
  }

  virtual void purge() final {
    std::cout << "Purge not implemented" << std::endl;
  }

public:
  /**
   * Method for adding known keys
   **/
  void addKey(const std::string pub_key) { m_counters[pub_key] = 0; }

  int getAccessCount(const std::string &pub_key) {
    if (m_counters.count(pub_key)) {
      return m_counters.at(pub_key);
    }
    return 0;
  }
};

BOOST_AUTO_TEST_SUITE(OperatorFactoryTest)

BOOST_AUTO_TEST_CASE(testing_OperatorFactoryAnon) {

  OperatorFactory operator_factory;
  DummyAuthManager dummy_manager;
  // Pass in const DummyAuthManager * to std::any
  std::any argument = dynamic_cast<IAuthenticationManager *>(&dummy_manager);

  auto auth_operator =
      operator_factory.create(OperatorType::Authenticator, argument);
  BOOST_CHECK(auth_operator->type() == OperatorType::Authenticator);

  MessageFactory msg_factory;
  auto msg = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  msg->set(MessageAttribute::KEY, "bad_key");

  // Because "bad_key" is:
  // 1. not a known key or an authenticated key
  //
  // After running execute the UID will be "anon_bad_key"
  auth_operator->execute(*msg);
  BOOST_CHECK(
      std::get<std::string>(msg->get(MessageAttribute::ID)).compare("anon") ==
      0);

  // Should not have been incremented because it is an unknown anonymous user
  // key
  BOOST_CHECK(dummy_manager.getAccessCount("bad_key") == 0);
}

BOOST_AUTO_TEST_CASE(testing_OperatorFactoryKnown) {

  OperatorFactory oper_factory;
  DummyAuthManager dummy_manager;

  // Add a known key
  dummy_manager.addKey("skeleton_key");
  // Pass in const DummyAuthManager * to std::any
  std::any argument = dynamic_cast<IAuthenticationManager *>(&dummy_manager);

  auto auth_operator =
      oper_factory.create(OperatorType::Authenticator, argument);
  BOOST_CHECK(auth_operator->type() == OperatorType::Authenticator);

  MessageFactory msg_factory;
  auto msg = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  msg->set(MessageAttribute::KEY, "skeleton_key");

  // Because "George" is:
  // 1. not a key
  // 2. not an authenticated key
  //
  // After running execute the UID will be "anon_George"
  auth_operator->execute(*msg);
  BOOST_CHECK(std::get<std::string>(msg->get(MessageAttribute::ID))
                  .compare("authenticated_uid") == 0);

  // Should be incremented because user key was known
  BOOST_CHECK(dummy_manager.getAccessCount("skeleton_key") == 1);
}

BOOST_AUTO_TEST_CASE(testing_RouterBookKeepingOperator) {

  OperatorFactory oper_factory;

  std::string client_id = "my_nice_proxy_id";
  std::any obfuscated_id = client_id;
  auto router_book_keeping_operator =
      oper_factory.create(OperatorType::RouterBookKeeping, obfuscated_id);
  BOOST_CHECK(router_book_keeping_operator->type() ==
              OperatorType::RouterBookKeeping);

  MessageFactory msg_factory;
  auto msg = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  msg->set(MessageAttribute::KEY, "skeleton_key");

  // Should add "my_nice_proxy_id" to the routes
  router_book_keeping_operator->execute(*msg);
  BOOST_CHECK(msg->getRoutes().size() == 1);
  BOOST_CHECK(msg->getRoutes().front().compare(client_id) == 0);
}

BOOST_AUTO_TEST_SUITE_END()
