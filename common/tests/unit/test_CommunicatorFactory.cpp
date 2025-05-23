#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE communication_factory
#include <boost/test/unit_test.hpp>

// Local public includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/ICredentials.hpp"
#include "common/MessageFactory.hpp"
#include "common/ProtocolTypes.hpp"

// Proto file includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"

// Standard includes
#include <iostream>
#include <string>
#include <unordered_map>

using namespace SDMS;

// For these keys you cannot use an arbitrary list of characters
const std::string public_key =
    "pF&3ZS3rd2HYesV&KbDEb7T@RaHhcZD@FDwqef9f"; // 40 chars - must be a legit
                                                // pub key
const std::string secret_key =
    "*XFVZrCnhPd5DrQTZ!V%zqZoPfs@8pcP23l3kfei"; // 40 chars - must be a legit
                                                // priv key
const std::string server_key =
    "AX0D+@G+P$Wv.<W^bu05y<4I++lKN!4<j+=wxe}0"; // 40 chars - must be a legit
                                                // pub key

SocketOptions generateCommonOptions(const std::string channel) {
  SocketOptions socket_options;
  socket_options.scheme = URIScheme::INPROC;
  socket_options.class_type = SocketClassType::SERVER;
  socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
  socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
  socket_options.connection_life = SocketConnectionLife::PERSISTENT;
  socket_options.protocol_type = ProtocolType::ZQTP;
  socket_options.host = channel;
  return socket_options;
}

struct GlobalProtobufTeardown {
    ~GlobalProtobufTeardown() {
        // This is the teardown function that runs once at the end
        google::protobuf::ShutdownProtobufLibrary();
    }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);

BOOST_AUTO_TEST_SUITE(CommunicatorFactoryTest)

BOOST_AUTO_TEST_CASE(testing_CommunicatorFactory) {

  std::cout << "\n*****************************" << std::endl;
  std::cout << "Starting insecure test" << std::endl;

  LogContext log_context;
  log_context.thread_name = "test_communicator_factory";
  CommunicatorFactory factory(log_context);
  // Create the client communicator
  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = generateCommonOptions("test_channel");
    socket_options.port = 1341;
    socket_options.local_id = server_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 40;
    long timeout_on_poll = 10;

    // When creating a communication channel with a client application we need
    // to locally have a server socket. So though we have specified a server
    // socket we will actually be communicating with a client.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  const std::string client_id = "minion";
  auto client = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = generateCommonOptions("test_channel");
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.port = 1341;
    socket_options.local_id = client_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  const std::string id = "Bob";
  const std::string key = "skeleton";

  auto client_id_from_comm = client->id();
  auto server_id_from_comm = server->id();
  std::cout << "Client id of communicator " << client_id_from_comm << std::endl;
  std::cout << "Server id of communicator " << server_id_from_comm << std::endl;
  BOOST_CHECK(client_id_from_comm.compare(client_id) == 0);
  BOOST_CHECK(server_id_from_comm.compare(server_id) == 0);

  MessageFactory msg_factory;
  const std::string token = "magic_token";
  { // Client send
    auto msg_from_client =
        msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);

    auto auth_by_token_req =
        std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);

    msg_from_client->setPayload(std::move(auth_by_token_req));

    client->send(*msg_from_client);
  }

  { // Server receive
    ICommunicator::Response response =
        server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);

    std::cout << "Key is "
              << std::get<std::string>(
                     response.message->get(MessageAttribute::KEY))
              << std::endl;
    std::cout << "ID is "
              << std::get<std::string>(
                     response.message->get(MessageAttribute::ID))
              << std::endl;
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);

    const auto &routes = response.message->getRoutes();
    std::cout << "Routes are " << std::endl;
    for (const auto &route : routes) {
      std::cout << route << std::endl;
    }
    BOOST_CHECK(routes.size() == 1);
    BOOST_CHECK(routes.front().compare(client_id) == 0);

    auto google_msg_ptr =
        std::get<::google::protobuf::Message *>(response.message->getPayload());
    Anon::AuthenticateByTokenRequest *payload =
        dynamic_cast<Anon::AuthenticateByTokenRequest *>(google_msg_ptr);

    BOOST_CHECK(payload->token().compare(token) == 0);
  }
}

BOOST_AUTO_TEST_CASE(testing_CommunicatorFactorySecure) {

  std::cout << "\n*****************************" << std::endl;
  std::cout << "Starting Secure test" << std::endl;

  LogContext log_context;
  log_context.thread_name = "test_communicator_factory_secure";
  CommunicatorFactory factory(log_context);
  // Create the client communicator
  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = generateCommonOptions("test_channel");
    socket_options.connection_security = SocketConnectionSecurity::SECURE;
    socket_options.port = 1342;
    socket_options.local_id = server_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 100;
    long timeout_on_poll = 10;

    // When creating a communication channel with a client application we need
    // to locally have a server socket. So though we have specified a server
    // socket we will actually be communicating with a client.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  const std::string client_id = "minion";
  auto client = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = generateCommonOptions("test_channel");
    socket_options.connection_security = SocketConnectionSecurity::SECURE;
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.port = 1342;
    socket_options.local_id = client_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 30;
    long timeout_on_poll = 10;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  const std::string id = "Bob";
  const std::string key = "skeleton";

  auto client_id_from_comm = client->id();
  auto server_id_from_comm = server->id();
  std::cout << "Client id of communicator " << client_id_from_comm << std::endl;
  std::cout << "Server id of communicator " << server_id_from_comm << std::endl;
  BOOST_CHECK(client_id_from_comm.compare(client_id) == 0);
  BOOST_CHECK(server_id_from_comm.compare(server_id) == 0);

  MessageFactory msg_factory;
  const std::string token = "magic_token";
  { // Client send
    auto msg_from_client =
        msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);

    auto auth_by_token_req =
        std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);

    msg_from_client->setPayload(std::move(auth_by_token_req));

    client->send(*msg_from_client);
  }

  { // Server receive
    ICommunicator::Response response =
        server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);

    std::cout << "Key is "
              << std::get<std::string>(
                     response.message->get(MessageAttribute::KEY))
              << std::endl;
    std::cout << "ID is "
              << std::get<std::string>(
                     response.message->get(MessageAttribute::ID))
              << std::endl;
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);

    const auto &routes = response.message->getRoutes();
    std::cout << "Routes are " << std::endl;
    for (const auto &route : routes) {
      std::cout << route << std::endl;
    }
    BOOST_CHECK(routes.size() == 1);
    BOOST_CHECK(routes.front().compare(client_id) == 0);

    auto google_msg_ptr =
        std::get<::google::protobuf::Message *>(response.message->getPayload());
    Anon::AuthenticateByTokenRequest *payload =
        dynamic_cast<Anon::AuthenticateByTokenRequest *>(google_msg_ptr);

    BOOST_CHECK(payload->token().compare(token) == 0);
  }

  { // Client send an empty payload i.e. an ack
    auto msg_from_client =
        msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);

    auto ack_reply = std::make_unique<Anon::AckReply>();

    msg_from_client->setPayload(std::move(ack_reply));

    client->send(*msg_from_client);
  }

  { // Receive an empty payload
    ICommunicator::Response response =
        server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);

    std::cout << "Key is "
              << std::get<std::string>(
                     response.message->get(MessageAttribute::KEY))
              << std::endl;
    std::cout << "ID is "
              << std::get<std::string>(
                     response.message->get(MessageAttribute::ID))
              << std::endl;
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);

    const auto &routes = response.message->getRoutes();
    std::cout << "Routes are " << std::endl;
    for (const auto &route : routes) {
      std::cout << route << std::endl;
    }
    BOOST_CHECK(routes.size() == 1);
    BOOST_CHECK(routes.front().compare(client_id) == 0);

    auto google_msg_ptr =
        std::get<::google::protobuf::Message *>(response.message->getPayload());
    dynamic_cast<Anon::AckReply *>(google_msg_ptr);
  }
}

BOOST_AUTO_TEST_CASE(testing_CommunicatorFactoryReply) {

  LogContext log_context;
  log_context.thread_name = "test_communicator_factory_with_reply";
  CommunicatorFactory factory(log_context);
  // Create the client communicator
  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::SERVER;
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::PERSISTENT;
    socket_options.protocol_type = ProtocolType::ZQTP;
    socket_options.host = "test_channel2";
    socket_options.port = 1343;
    socket_options.local_id = server_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    // When creating a communication channel with a client application we need
    // to locally have a server socket. So though we have specified a server
    // socket we will actually be communicating with a client.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  const std::string client_id = "minion";
  auto client = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP;
    socket_options.host = "test_channel2";
    socket_options.port = 1343;
    socket_options.local_id = client_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  const std::string id = "Bob";
  const std::string key = "skeleton";

  auto client_id_from_comm = client->id();
  auto server_id_from_comm = server->id();
  std::cout << "Client id of communicator " << client_id_from_comm << std::endl;
  std::cout << "Server id of communicator " << server_id_from_comm << std::endl;
  BOOST_CHECK(client_id_from_comm.compare(client_id) == 0);
  BOOST_CHECK(server_id_from_comm.compare(server_id) == 0);

  MessageFactory msg_factory;
  const std::string token = "magic_token";

  /************************CLIENT BEGIN****************/
  // Client send
  auto msg_from_client =
      msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  msg_from_client->set(MessageAttribute::ID, id);
  msg_from_client->set(MessageAttribute::KEY, key);

  auto auth_by_token_req = std::make_unique<Anon::AuthenticateByTokenRequest>();
  auth_by_token_req->set_token(token);

  msg_from_client->setPayload(std::move(auth_by_token_req));

  client->send(*msg_from_client);
  // Client send
  /************************CLIENT END****************/

  /************************SERVER BEGIN****************/
  // Server receive
  ICommunicator::Response response =
      server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  BOOST_CHECK(response.time_out == false);
  BOOST_CHECK(response.error == false);

  std::cout << "Key is "
            << std::get<std::string>(
                   response.message->get(MessageAttribute::KEY))
            << std::endl;
  std::cout << "ID is "
            << std::get<std::string>(
                   response.message->get(MessageAttribute::ID))
            << std::endl;
  BOOST_CHECK(
      std::get<std::string>(response.message->get(MessageAttribute::KEY))
          .compare(key) == 0);
  BOOST_CHECK(std::get<std::string>(response.message->get(MessageAttribute::ID))
                  .compare(id) == 0);

  const auto &routes = response.message->getRoutes();
  std::cout << "Routes are " << std::endl;
  for (const auto &route : routes) {
    std::cout << route << std::endl;
  }
  BOOST_CHECK(routes.size() == 1);
  BOOST_CHECK(routes.front().compare(client_id) == 0);

  auto google_msg_ptr =
      std::get<::google::protobuf::Message *>(response.message->getPayload());
  Anon::AuthenticateByTokenRequest *payload =
      dynamic_cast<Anon::AuthenticateByTokenRequest *>(google_msg_ptr);

  BOOST_CHECK(payload->token().compare(token) == 0);
  // Server receive

  // Server send
  auto nack_msg = msg_factory.createResponseEnvelope(*response.message);

  // Create Google proto message
  auto nack_reply = std::make_unique<Anon::NackReply>();
  nack_reply->set_err_code(ErrorCode::ID_SERVICE_ERROR);
  std::string error_msg = "testing_no_error";
  nack_reply->set_err_msg(error_msg);

  // Place google proto message in IMessage
  nack_msg->setPayload(std::move(nack_reply));

  server->send(*nack_msg);
  // Server send
  /************************SERVER END****************/

  /************************CLIENT BEGIN****************/
  // Client receive
  ICommunicator::Response response_client =
      client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  while (response_client.time_out == true) {
    response_client = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  }
  BOOST_CHECK(response_client.error == false);

  // At this point there should be no routes
  BOOST_CHECK(response_client.message->getRoutes().size() == 0);

  auto response_google_msg_ptr = std::get<::google::protobuf::Message *>(
      response_client.message->getPayload());
  Anon::NackReply *response_payload =
      dynamic_cast<Anon::NackReply *>(response_google_msg_ptr);

  BOOST_CHECK(response_payload->err_code() == ErrorCode::ID_SERVICE_ERROR);
  BOOST_CHECK(response_payload->err_msg().compare(error_msg) == 0);

  // Client receive
  /************************CLIENT END****************/
}

BOOST_AUTO_TEST_SUITE_END()
