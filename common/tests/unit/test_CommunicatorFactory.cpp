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
////////////////////////////////////////
///       START OF HTTP TESTING     ///
//////////////////////////////////////
BOOST_AUTO_TEST_CASE(testing_CommunicatorFactory_HTTP) {

  std::cout << "\n*****************************" << std::endl;
  std::cout << "Starting HTTP insecure test" << std::endl;

  LogContext log_context;
  log_context.thread_name = "test_communicator_factory";
  CommunicatorFactory factory(log_context);
  // Create the client communicator
  const std::string server_id = "overlord";
  

  const std::string client_id = "ClientID";
  
  auto client = [&]() {
    /// Creating input parameters for constructing Communication Instance
    ///
    /// OVERWRITE THE OPTIONS AS DEFAULT IS MADE FOR ZMQ
    SocketOptions socket_options = generateCommonOptions("localhost");
    socket_options.scheme = URIScheme::HTTP;
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.port = 8080;
    socket_options.protocol_type = ProtocolType::HTTP;
    socket_options.local_id = client_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;

    auto credentials = cred_factory.create(ProtocolType::HTTP, cred_options);

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
 //FLAG THIS IS CAUSING A MEMORY ISSUE
  auto client_id_from_comm = client->id();
  BOOST_CHECK(client_id_from_comm.compare(client_id) == 0);
  
  MessageFactory msg_factory;

  const std::string token = "magic_token";
  { // Client send post test
    auto msg_from_client = msg_factory.create(MessageType::STRING);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);
    msg_from_client->set(MessageAttribute::ENDPOINT, "http://localhost:8080/api/post");
    msg_from_client->set(MessageAttribute::VERB, "POST");
    msg_from_client->set(MessageAttribute::BODY, "{'fruit': 'apple'}");

    //Set the endpoint, verb, and body.
    std::string endpoint = std::get<std::string>(msg_from_client->get(MessageAttribute::ENDPOINT)); 
    std::string verb = std::get<std::string>(msg_from_client->get(MessageAttribute::VERB));
    std::string body = std::get<std::string>(msg_from_client->get(MessageAttribute::BODY));

    // Using string concatenation to set the payload  WHEN I GET BACK YOU NEED TO MAKE THIS INTO A FUNCTION
    std::string payload = "Endpoint:" + endpoint + ", " +
                          "Verb:" + verb + ", " +
                          "Body:" + body;
    
    //std::cout << payload << std::endl;
    //We need to ensure there is a standard so first off we give the endpoint, then the Verb then the message.
    //We later want to break this up once we do the send function we should break up each of these into seperate pieces for proper curl usage.
    msg_from_client->setPayload(std::string(payload)); 
    client->send(*msg_from_client);
  }
{ // Client send get test
    auto msg_from_client2 = msg_factory.create(MessageType::STRING);
    msg_from_client2->set(MessageAttribute::ID, id);
    msg_from_client2->set(MessageAttribute::KEY, key);
    msg_from_client2->set(MessageAttribute::ENDPOINT, "http://localhost:8080/api/fruits");
    msg_from_client2->set(MessageAttribute::VERB, "GET");
    msg_from_client2->set(MessageAttribute::BODY, "{}");
    
    //Set the endpoint, verb, and body.
    std::string endpoint = std::get<std::string>(msg_from_client2->get(MessageAttribute::ENDPOINT)); 
    std::string verb = std::get<std::string>(msg_from_client2->get(MessageAttribute::VERB));
    std::string body = std::get<std::string>(msg_from_client2->get(MessageAttribute::BODY));

    // Using string concatenation to set the payload
    std::string payload = "Endpoint:" + endpoint + ", " +
                          "Verb:" + verb + ", " +
                          "Body:" + body;
    
    //We need to ensure there is a standard so first off we give the endpoint, then the Verb then the message.
    //We later want to break this up once we do the send function we should break up each of these into seperate pieces for proper curl usage.
    msg_from_client2->setPayload(std::string(payload)); 
    client->send(*msg_from_client2);
  }
  
  { // Client receive
    ICommunicator::Response response = 
    client->receive(MessageType::STRING);
    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);
    BOOST_CHECK(response.message->type()==MessageType::STRING);
 
    auto string_msg_content =
        std::get<std::string >(response.message->getPayload());

    std::cout<< "String Msg Content:" << std::endl;
    std::cout<< string_msg_content << std::endl;
    std::string testResult = R"({
  "data": {
    "fruit": "apple"
  },
  "message": "POST request received"
}
)" ;
       // std::cout << testResult << std::endl;
        BOOST_CHECK(string_msg_content.compare(testResult) == 0);
  }

  std::cout << "Sending shutdown command to dummy server" << std::endl;
  {
    auto shutdown_from_client = msg_factory.create(MessageType::STRING);
    //We need to ensure there is a standard so first off we give the endpoint, then the Verb then the message.
    //We later want to break this up once we do the send function we should break up each of these into seperate pieces for proper curl usage.
    shutdown_from_client->setPayload(std::string("Endpoint:http://127.0.0.1:8080/api/shutdown, Verb:POST, Body:{}")); 
    client->send(*shutdown_from_client);
  }

}
BOOST_AUTO_TEST_SUITE_END()

