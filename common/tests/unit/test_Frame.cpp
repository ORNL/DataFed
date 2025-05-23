#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE frame
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "Frame.hpp"

// Local public includes
#include "common/MessageFactory.hpp"
#include "common/ProtoBufMap.hpp"

// Proto file includes
#include "common/SDMS_Anon.pb.h"

// Standard includes
#include <iostream>

using namespace SDMS;

struct GlobalProtobufTeardown {
    ~GlobalProtobufTeardown() {
        // This is the teardown function that runs once at the end
        google::protobuf::ShutdownProtobufLibrary();
    }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);

BOOST_AUTO_TEST_SUITE(FrameTest)

BOOST_AUTO_TEST_CASE(testing_Frame) {

  Frame frame;

  BOOST_CHECK(frame.size == 0);
  BOOST_CHECK(frame.proto_id == 0);
  BOOST_CHECK(frame.msg_id == 0);
  BOOST_CHECK(frame.context == 0);

  frame.size = 4;
  frame.proto_id = 3;
  frame.msg_id = 1;
  frame.context = 2;

  BOOST_CHECK(frame.size == 4);
  BOOST_CHECK(frame.proto_id == 3);
  BOOST_CHECK(frame.msg_id == 1);
  BOOST_CHECK(frame.context == 2);

  frame.clear();

  BOOST_CHECK(frame.size == 0);
  BOOST_CHECK(frame.proto_id == 0);
  BOOST_CHECK(frame.msg_id == 0);
  BOOST_CHECK(frame.context == 0);
}

BOOST_AUTO_TEST_CASE(testing_FrameConverter) {

  Frame frame;
  frame.size = 4;
  frame.proto_id = 3;
  frame.msg_id = 1;
  frame.context = 2;

  FrameConverter converter;

  zmq_msg_t zmq_msg;
  zmq_msg_init_size(&zmq_msg, 8);
  converter.copy(FrameConverter::CopyDirection::FROM_FRAME, zmq_msg, frame);

  Frame frame_new;
  converter.copy(FrameConverter::CopyDirection::TO_FRAME, zmq_msg, frame_new);

  BOOST_CHECK(frame_new.size == 4);
  BOOST_CHECK(frame_new.proto_id == 3);
  BOOST_CHECK(frame_new.msg_id == 1);
  BOOST_CHECK(frame_new.context == 2);
}

BOOST_AUTO_TEST_CASE(testing_FrameFactory) {

  FrameFactory factory;

  ProtoBufMap proto_map;

  SDMS::Anon::AuthenticateByPasswordRequest auth_by_pass_req;
  const std::string uid = "tonystark";
  const std::string password = "skeleton_key";
  auth_by_pass_req.set_uid(uid);
  auth_by_pass_req.set_password(password);

  size_t expected_size = auth_by_pass_req.ByteSizeLong();
  size_t expected_msg_type = proto_map.getMessageType(auth_by_pass_req);

  Frame frame = factory.create(auth_by_pass_req, proto_map);

  BOOST_CHECK(frame.size == expected_size);
  BOOST_CHECK(frame.getMsgType() == expected_msg_type);
}

BOOST_AUTO_TEST_CASE(testing_FrameFactory_EmptyPayload) {

  MessageFactory msg_factory;
  auto msg = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

  FrameFactory factory;
  Frame frame = factory.create(*msg);

  BOOST_CHECK(frame.size == 0);
  BOOST_CHECK(frame.proto_id == 0);
  BOOST_CHECK(frame.msg_id == 0);
  BOOST_CHECK(frame.getMsgType() == 0);

  auto msg_new = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  FrameConverter converter;
  Frame frame_new;
  converter.copy(FrameConverter::CopyDirection::FROM_FRAME, *msg_new,
                 frame_new);

  BOOST_CHECK(frame_new.size == 0);
  BOOST_CHECK(frame_new.proto_id == 0);
  BOOST_CHECK(frame_new.msg_id == 0);
  BOOST_CHECK(frame_new.getMsgType() == 0);
}

BOOST_AUTO_TEST_CASE(testing_FrameFactory2) {

  FrameFactory frame_factory;
  MessageFactory msg_factory;
  ProtoBufMap proto_map;

  auto msg = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  auto auth_by_token_req = std::make_unique<Anon::AuthenticateByTokenRequest>();
  auth_by_token_req->set_token("magic_token");

  Frame frame_from_protocol_msg =
      frame_factory.create(*auth_by_token_req, proto_map);

  msg->setPayload(std::move(auth_by_token_req));

  Frame frame_IMessage = frame_factory.create(*msg);

  std::cout << "frame_generated_from_IMessage" << std::endl;
  std::cout << frame_IMessage.size << std::endl;
  std::cout << frame_IMessage.proto_id << std::endl;
  std::cout << frame_IMessage.msg_id << std::endl;
  std::cout << frame_IMessage.context << std::endl;
  std::cout << "frame_generated_from_protocol_msg" << std::endl;
  std::cout << frame_from_protocol_msg.size << std::endl;
  std::cout << frame_from_protocol_msg.proto_id << std::endl;
  std::cout << frame_from_protocol_msg.msg_id << std::endl;
  std::cout << frame_from_protocol_msg.context << std::endl;

  BOOST_CHECK(frame_IMessage.size == frame_from_protocol_msg.size);
  BOOST_CHECK(frame_IMessage.proto_id == frame_from_protocol_msg.proto_id);
  BOOST_CHECK(frame_IMessage.msg_id == frame_from_protocol_msg.msg_id);
  BOOST_CHECK(frame_IMessage.context == frame_from_protocol_msg.context);
}

BOOST_AUTO_TEST_SUITE_END()
