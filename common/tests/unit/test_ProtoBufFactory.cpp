#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE protobuffactory
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "ProtoBufFactory.hpp"

// Local public includes
#include "common/ProtoBufMap.hpp"

// Proto file includes
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"

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

BOOST_AUTO_TEST_SUITE(ProtoBufFactoryTest)

BOOST_AUTO_TEST_CASE(testing_ProtoBufFactory) {

  ProtoBufMap proto_map;
  ProtoBufFactory proto_factory;

  SDMS::Anon::VersionRequest version_request;
  uint16_t msg_type = proto_map.getMessageType(version_request);
  auto msg = proto_factory.create(msg_type);
  BOOST_CHECK(msg_type == proto_map.getMessageType(*msg));
}

BOOST_AUTO_TEST_CASE(testing_ProtoBufFactory2) {

  ProtoBufMap proto_map;
  ProtoBufFactory proto_factory;

  SDMS::Anon::NackReply nack_reply;
  uint16_t msg_type = proto_map.getMessageType(nack_reply);
  auto msg = proto_factory.create(msg_type);
  BOOST_CHECK(msg_type == proto_map.getMessageType(*msg));

  auto nack_reply_new = dynamic_cast<SDMS::Anon::NackReply &>(*msg);

  nack_reply_new.set_err_msg("This is working");
}
BOOST_AUTO_TEST_SUITE_END()
