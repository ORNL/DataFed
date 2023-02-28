#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE communication_factory
#include <boost/test/unit_test.hpp>

// Local public includes
#include "CommunicatorFactory.hpp"
#include "CredentialFactory.hpp"
#include "ICredentials.hpp"
#include "MessageFactory.hpp"
#include "ProtocolTypes.hpp"

// Proto file includes
#include <SDMS.pb.h>
#include <SDMS_Anon.pb.h>

// Standard includes
#include <iostream>
#include <string>
#include <unordered_map>
#include <variant>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(CommunicatorFactoryTest)

BOOST_AUTO_TEST_CASE( testing_CommunicatorFactory ) {


  CommunicatorFactory factory;
  // Create the client communicator
  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::SERVER; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = "test_channel";
    socket_options.port = 1341;
    socket_options.local_id = server_id;

    std::string public_key = "my_pub_key";
    std::string secret_key = "my_priv_key";
    std::string server_key = "my_serv_key";
    CredentialFactory cred_factory;
   
    std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    // When creating a communication channel with a client application we need
    // to locally have a server socket. So though we have specified a server
    // socket we will actually be communicating with a client.
    return factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
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
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = "test_channel";
    socket_options.port = 1341;
    socket_options.local_id = client_id;

    std::string public_key = "my_pub_key";
    std::string secret_key = "my_priv_key";
    std::string server_key = "my_serv_key";
    CredentialFactory cred_factory;
   
    std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
        timeout_on_poll);
  }();

  const std::string id = "Bob";
  const std::string key = "skeleton";

  auto client_id_from_comm = client->id();
  auto server_id_from_comm = server->id();
  std::cout << "Client id of communicator " << client_id_from_comm << std::endl;
  std::cout << "Server id of communicator " << server_id_from_comm << std::endl;
  BOOST_CHECK( client_id_from_comm.compare(client_id) == 0);
  BOOST_CHECK( server_id_from_comm.compare(server_id) == 0);

  MessageFactory msg_factory;
  const std::string token = "magic_token";
  { // Client send
    auto msg_from_client = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);

    auto auth_by_token_req = std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);

    msg_from_client->setPayload(std::move(auth_by_token_req));
    
    client->send(*msg_from_client);
  }

  { // Server receive
    ICommunicator::Response response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    BOOST_CHECK( response.time_out == false);
    BOOST_CHECK( response.error == false);

    std::cout << "Key is " << std::get<std::string>(response.message->get(MessageAttribute::KEY)) << std::endl;
    std::cout << "ID is " << std::get<std::string>(response.message->get(MessageAttribute::ID)) << std::endl;
    BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::KEY)).compare(key) == 0);
    BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::ID)).compare(id) == 0);
    
    const auto & routes = response.message->getRoutes();
    std::cout << "Routes are " << std::endl;
    for( const auto & route : routes ) {
      std::cout << route << std::endl;
    }
    BOOST_CHECK( routes.size() == 1);
    BOOST_CHECK( routes.front().compare(client_id) == 0);

    auto google_msg_ptr = std::get<::google::protobuf::Message *>(response.message->getPayload());
    Anon::AuthenticateByTokenRequest * payload = dynamic_cast<Anon::AuthenticateByTokenRequest *>(google_msg_ptr);
    
    BOOST_CHECK(payload->token().compare(token) == 0);
  }
}

BOOST_AUTO_TEST_CASE( testing_CommunicatorFactoryReply ) {


  CommunicatorFactory factory;
  // Create the client communicator
  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::SERVER; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = "test_channel2";
    socket_options.port = 1341;
    socket_options.local_id = server_id;

    std::string public_key = "my_pub_key";
    std::string secret_key = "my_priv_key";
    std::string server_key = "my_serv_key";
    CredentialFactory cred_factory;
   
    std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    // When creating a communication channel with a client application we need
    // to locally have a server socket. So though we have specified a server
    // socket we will actually be communicating with a client.
    return factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
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
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = "test_channel2";
    socket_options.port = 1341;
    socket_options.local_id = client_id;

    std::string public_key = "my_pub_key";
    std::string secret_key = "my_priv_key";
    std::string server_key = "my_serv_key";
    CredentialFactory cred_factory;
   
    std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = public_key;
    cred_options[CredentialType::PRIVATE_KEY] = secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 10;
    long timeout_on_poll = 10;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
        timeout_on_poll);
  }();

  const std::string id = "Bob";
  const std::string key = "skeleton";

  auto client_id_from_comm = client->id();
  auto server_id_from_comm = server->id();
  std::cout << "Client id of communicator " << client_id_from_comm << std::endl;
  std::cout << "Server id of communicator " << server_id_from_comm << std::endl;
  BOOST_CHECK( client_id_from_comm.compare(client_id) == 0);
  BOOST_CHECK( server_id_from_comm.compare(server_id) == 0);

  MessageFactory msg_factory;
  const std::string token = "magic_token";

  /************************CLIENT BEGIN****************/
  // Client send
  auto msg_from_client = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
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
  ICommunicator::Response response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  BOOST_CHECK( response.time_out == false);
  BOOST_CHECK( response.error == false);

  std::cout << "Key is " << std::get<std::string>(response.message->get(MessageAttribute::KEY)) << std::endl;
  std::cout << "ID is " << std::get<std::string>(response.message->get(MessageAttribute::ID)) << std::endl;
  BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::KEY)).compare(key) == 0);
  BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::ID)).compare(id) == 0);

  const auto & routes = response.message->getRoutes();
  std::cout << "Routes are " << std::endl;
  for( const auto & route : routes ) {
    std::cout << route << std::endl;
  }
  BOOST_CHECK( routes.size() == 1);
  BOOST_CHECK( routes.front().compare(client_id) == 0);

  auto google_msg_ptr = std::get<::google::protobuf::Message *>(response.message->getPayload());
  Anon::AuthenticateByTokenRequest * payload = dynamic_cast<Anon::AuthenticateByTokenRequest *>(google_msg_ptr);

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
  ICommunicator::Response response_client = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  while( response_client.time_out == true ) {
    response_client = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  }
  BOOST_CHECK( response_client.error == false);

  // At this point there should be no routes
  BOOST_CHECK( response_client.message->getRoutes().size() == 0);

  auto response_google_msg_ptr = std::get<::google::protobuf::Message *>(response_client.message->getPayload());
  Anon::NackReply * response_payload = dynamic_cast<Anon::NackReply *>(response_google_msg_ptr);

  BOOST_CHECK( response_payload->err_code() == ErrorCode::ID_SERVICE_ERROR);
  BOOST_CHECK( response_payload->err_msg().compare(error_msg) == 0);
  
  // Client receive
  /************************CLIENT END****************/
}

BOOST_AUTO_TEST_SUITE_END()

