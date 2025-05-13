#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE protobuffactory
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "ProtoBufFactory.hpp"

// Local public includes
#include "common/ProtoBufMap.hpp"

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

BOOST_AUTO_TEST_CASE(testing_ProtoBufFactory_ProtocolID) {
  ProtoBufMap proto_map;

  uint8_t proto_id =
      proto_map.getProtocolID(MessageProtocol::GOOGLE_ANONONYMOUS);
  BOOST_CHECK(proto_id == 1);
  proto_id = proto_map.getProtocolID(MessageProtocol::GOOGLE_AUTHORIZED);
  BOOST_CHECK(proto_id == 2);
}

BOOST_AUTO_TEST_CASE(testing_ProtoBufFactory) {
  ProtoBufMap proto_map;
  ProtoBufFactory proto_factory;

  SDMS::Anon::VersionRequest version_request;
  uint16_t msg_type = proto_map.getMessageType(version_request);
  auto msg = proto_factory.create(msg_type);
  std::cout << "VersionRequest msg_type of VersionRequest, " << msg_type
            << " and " << proto_map.getMessageType(*msg) << std::endl;
}

BOOST_AUTO_TEST_CASE(testing_ProtoBufMap_toString) {
  ProtoBufMap proto_map;
  SDMS::Anon::VersionRequest version_request;
  uint16_t msg_type = proto_map.getMessageType(version_request);
  auto name = proto_map.toString(msg_type);
  BOOST_CHECK(name.compare("VersionRequest") == 0);
}

BOOST_AUTO_TEST_SUITE_END()
