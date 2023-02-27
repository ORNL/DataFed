#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE protobuffactory
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "ProtoBufFactory.hpp"
#include "ProtoBufMap.hpp"

// Standard includes
#include <iostream>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(ProtoBufFactoryTest)

BOOST_AUTO_TEST_CASE( testing_ProtoBufFactory ) {

  ProtoBufMap proto_map;
  ProtoBufFactory proto_factory;

  SDMS::Anon::VersionRequest version_request;
  uint16_t msg_type = proto_map.getMessageType(version_request); 
  auto msg = proto_factory.create(msg_type);
  std::cout << "VersionRequest msg_type of VersionRequest, " << msg_type << " and " << proto_map.getMessageType(*msg) << std::endl;
  

}
BOOST_AUTO_TEST_SUITE_END()

