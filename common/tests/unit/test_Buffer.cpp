#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE buffer
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "Buffer.hpp"
#include "ProtoBufFactory.hpp"

// Local public includes
#include "common/ProtoBufMap.hpp"

// Standard includes
#include <iostream>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(BufferTest)

BOOST_AUTO_TEST_CASE(testing_Buffer) {

  Buffer buffer;

  BOOST_CHECK(buffer.size() == 0);
  BOOST_CHECK(buffer.maxSize() == MEGABYTE);
  BOOST_CHECK(buffer.capacity() == 0);
  BOOST_CHECK(buffer.toString().empty());
}

BOOST_AUTO_TEST_CASE(testing_Buffer_non_trivial) {
  const size_t array_size = 3;
  char array_chars[array_size] = {0};

  array_chars[0] = 'B';
  array_chars[1] = 'o';
  array_chars[2] = 'b';

  Buffer buffer;
  buffer.reserve(array_size);

  /**
   * The size is still 0 because nothing is in it but the capacity is 4
   **/
  BOOST_CHECK(buffer.capacity() == array_size);
  BOOST_CHECK(buffer.size() == 0);

  copyToBuffer(buffer, array_chars, array_size);

  BOOST_CHECK(buffer.capacity() == array_size);
  BOOST_CHECK(buffer.size() == array_size);

  std::string bob("Bob");
  BOOST_CHECK(buffer.toString().compare("Bob") == 0);

  char new_array_chars[array_size] = {0};
  copyFromBuffer(new_array_chars, buffer);

  for (size_t i = 0; i < array_size; ++i) {
    BOOST_CHECK(new_array_chars[i] == array_chars[i]);
  }
}

BOOST_AUTO_TEST_CASE(testing_Buffer_non_trivial2) {
  const size_t array_size = 3;
  char array_chars[array_size] = {0};

  array_chars[0] = 'B';
  array_chars[1] = 'o';
  array_chars[2] = 'b';

  Buffer buffer;
  buffer.reserve(array_size);

  copyToBuffer(buffer, array_chars, array_size);

  BOOST_CHECK(buffer.capacity() == array_size);
  BOOST_CHECK(buffer.size() == array_size);

  const size_t new_array_size = 5;
  char new_array_chars[new_array_size] = {0};

  new_array_chars[0] = 'J';
  new_array_chars[1] = 'a';
  new_array_chars[2] = 's';
  new_array_chars[3] = 'o';
  new_array_chars[4] = 'n';

  copyToBuffer(buffer, new_array_chars, new_array_size);

  BOOST_CHECK(buffer.capacity() == new_array_size);
  BOOST_CHECK(buffer.size() == new_array_size);
  BOOST_CHECK(buffer.toString().compare("Jason") == 0);

  // Shrink
  copyToBuffer(buffer, array_chars, array_size);
  BOOST_CHECK(buffer.capacity() == new_array_size);
  BOOST_CHECK(buffer.size() == array_size);
}

BOOST_AUTO_TEST_CASE(testing_Buffer_googleprotobuf) {

  ProtoBufMap proto_map;
  ProtoBufFactory proto_factory;

  SDMS::Anon::AuthenticateByPasswordRequest auth_by_pass_req;

  const std::string uid = "tonystark";
  const std::string password = "skeleton_key";
  auth_by_pass_req.set_uid(uid);
  auth_by_pass_req.set_password(password);

  BOOST_CHECK(auth_by_pass_req.uid().compare(uid) == 0);
  BOOST_CHECK(auth_by_pass_req.password().compare(password) == 0);

  Buffer buffer;
  std::cout << "Calling Copy to buffer" << std::endl;
  size_t size = auth_by_pass_req.ByteSizeLong();
  copyToBuffer(buffer, &auth_by_pass_req, size);

  BOOST_CHECK(buffer.size() == buffer.capacity());
  BOOST_CHECK(buffer.size() == auth_by_pass_req.ByteSizeLong());

  // Create a new message and copy the buffer into it
  uint16_t msg_type = proto_map.getMessageType(auth_by_pass_req);
  std::unique_ptr<::google::protobuf::Message> new_msg =
      proto_factory.create(msg_type);

  copyFromBuffer(new_msg.get(), buffer);

  auto new_auth_by_pass_req =
      dynamic_cast<SDMS::Anon::AuthenticateByPasswordRequest *>(new_msg.get());

  BOOST_CHECK(new_auth_by_pass_req->password().compare(password) == 0);
  BOOST_CHECK(new_auth_by_pass_req->uid().compare(uid) == 0);
}

BOOST_AUTO_TEST_CASE(testing_Buffer_googleprotobuf_empty_payload) {

  ProtoBufMap proto_map;
  ProtoBufFactory proto_factory;

  SDMS::Anon::AckReply ack_reply;

  Buffer buffer;
  std::cout << "Calling Copy to buffer" << std::endl;
  size_t size = ack_reply.ByteSizeLong();
  copyToBuffer(buffer, &ack_reply, size);

  BOOST_CHECK(buffer.size() == buffer.capacity());
  BOOST_CHECK(buffer.size() == ack_reply.ByteSizeLong());

  // Create a new message and copy the buffer into it
  uint16_t msg_type = proto_map.getMessageType(ack_reply);
  std::unique_ptr<::google::protobuf::Message> new_msg =
      proto_factory.create(msg_type);

  copyFromBuffer(new_msg.get(), buffer);

  auto new_auth_by_pass_req =
      dynamic_cast<SDMS::Anon::AckReply *>(new_msg.get());
}
BOOST_AUTO_TEST_SUITE_END()
