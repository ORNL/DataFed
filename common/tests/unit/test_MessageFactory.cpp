#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE messagefactory
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local public includes
#include "common/MessageFactory.hpp"
#include "common/ProtoBufMap.hpp"

// Proto file includes
#include "common/SDMS_Anon.pb.h"

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(MessageFactoryTest)

BOOST_AUTO_TEST_CASE(testing_StringMessage) {

  MessageFactory msg_factory;

  auto message = msg_factory.create(MessageType::STRING); // Create StringMessage

  std::string user_id = "hermes";
  std::string key = "skeleton";

  message->set(MessageAttribute::ID, user_id);
  message->set(MessageAttribute::KEY, key);
  message->set(MessageAttribute::STATE, MessageState::REQUEST);
  //message->set("dynamic_attribute", static_cast<uint8_t>(42)); // Example dynamic attribute

  std::string payload = "test_payload";
  message->setPayload(payload); // Set payload as a string

  std::string route = "MtOlympia";
  message->addRoute(route);

  BOOST_CHECK(message->type() == MessageType::STRING);
  BOOST_CHECK(std::get<std::string>(message->get(MessageAttribute::ID)) == user_id);
  BOOST_CHECK(std::get<std::string>(message->get(MessageAttribute::KEY)) == key);
  BOOST_CHECK(std::get<MessageState>(message->get(MessageAttribute::STATE)) == MessageState::REQUEST);
  //BOOST_CHECK(std::get<uint8_t>(message->get("dynamic_attribute")) == 42); // Check dynamic attribute

  BOOST_CHECK(message->getRoutes().size() == 1);
  std::cout << message->getRoutes().front().compare(route) << std::endl;  
 // BOOST_CHECK(message->getRoutes().front().compare(route) == 0);

  // Test response message
  auto response_message = msg_factory.createResponseEnvelope(*message);

  BOOST_CHECK(response_message->getRoutes().size() == 1);
  BOOST_CHECK(message->getRoutes().front().compare(route) == 0);
  BOOST_CHECK(std::get<MessageState>(response_message->get(MessageAttribute::STATE)) == MessageState::RESPONSE);
}
BOOST_AUTO_TEST_CASE(testing_MessageFactory) {

  MessageFactory msg_factory;

  auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

  std::string user_id = "hermes";
  std::string key = "skeleton";
  const uint16_t context = 1;

  message->set(MessageAttribute::ID, user_id);
  message->set(MessageAttribute::KEY, key);
  message->set(MessageAttribute::STATE, MessageState::REQUEST);
  message->set(constants::message::google::CONTEXT, context);
  auto auth_by_token_req = std::make_unique<Anon::AuthenticateByTokenRequest>();
  std::string token = "golden_chest";
  auth_by_token_req->set_token(token);

  ProtoBufMap proto_map;
  uint16_t protobuf_msg_type = proto_map.getMessageType(*auth_by_token_req);

  message->setPayload(std::move(auth_by_token_req));

  std::string route = "MtOlympia";
  message->addRoute(route);

  BOOST_CHECK(message->type() == MessageType::GOOGLE_PROTOCOL_BUFFER);
  BOOST_CHECK(std::get<std::string>(message->get(MessageAttribute::ID))
                  .compare(user_id) == 0);
  BOOST_CHECK(
      std::get<std::string>(message->get(MessageAttribute::KEY)).compare(key) ==
      0);
  BOOST_CHECK(std::get<MessageState>(message->get(MessageAttribute::STATE)) ==
              MessageState::REQUEST);
  BOOST_CHECK(std::get<uint16_t>(message->get(
                  constants::message::google::MSG_TYPE)) == protobuf_msg_type);
  BOOST_CHECK(std::get<uint16_t>(message->get(
                  constants::message::google::CONTEXT)) == context);
  BOOST_CHECK(message->getRoutes().size() == 1);
  BOOST_CHECK(message->getRoutes().front().compare(route) == 0);

  /**
   * Payload will be empty in the response_message and so will the frame
   * but should include the routes
   **/
  auto response_message = msg_factory.createResponseEnvelope(*message);

  BOOST_CHECK(response_message->getRoutes().size() == 1);
  BOOST_CHECK(response_message->getRoutes().front().compare(route) == 0);
  BOOST_CHECK(std::get<MessageState>(response_message->get(
                  MessageAttribute::STATE)) == MessageState::RESPONSE);
  BOOST_CHECK(std::get<uint16_t>(response_message->get(
                  constants::message::google::CONTEXT)) == context);
}

BOOST_AUTO_TEST_SUITE_END()
