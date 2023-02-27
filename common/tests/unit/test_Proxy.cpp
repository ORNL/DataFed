#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE proxy
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local public includes
#include "CommunicatorFactory.hpp"
#include "CredentialFactory.hpp"
#include "ICredentials.hpp"
#include "IOperator.hpp"
#include "MessageFactory.hpp"
#include "OperatorFactory.hpp"
#include "OperatorTypes.hpp"
#include "Proxy.hpp"
#include "SocketOptions.hpp"

// Proto file includes
#include <SDMS_Anon.pb.h>
#include <SDMS_Auth.pb.h>

// Standard includes
#include <memory>
#include <string>
#include <thread>
#include <unordered_map>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(ProxyTest)

BOOST_AUTO_TEST_CASE( testing_Proxy ) {

  const std::string channel_between_proxy_and_backend = "channeltobackend";
  const std::string channel_between_proxy_and_frontend = "channeltofrontend";
  CommunicatorFactory factory;

  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::SERVER; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::SYNCHRONOUS;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = channel_between_proxy_and_backend;
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
    socket_options.host = channel_between_proxy_and_frontend;
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

    // Make it wait forever
    uint32_t timeout_on_receive = -1;
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


  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread = std::unique_ptr<std::thread>(new std::thread(
        [](const std::string proxy_client_id, const std::string proxy_server_id) { 

        std::unordered_map<Proxy::SocketRole, SocketOptions> socket_options;
        std::unordered_map<Proxy::SocketRole, ICredentials *> socket_credentials;

        const std::string channel_between_proxy_and_backend = "channeltobackend";
        const std::string channel_between_proxy_and_frontend = "channeltofrontend";
        // Credentials are allocated on the heap, to ensure they last until the end of
        // the test they must be defined outside of the scope block below
        std::unique_ptr<ICredentials> client_credentials;

        { // Proxy Client Credentials and Socket Options - these options are used
        // to define the client socket that the proxy will use to communicate with
        // the backend. The proxy acts like a client to the backend
        SocketOptions client_socket_options;
        client_socket_options.scheme = URIScheme::INPROC;
        client_socket_options.class_type = SocketClassType::CLIENT; 
        client_socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
        client_socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
        client_socket_options.protocol_type = ProtocolType::ZQTP; 
        client_socket_options.host = channel_between_proxy_and_backend;
        client_socket_options.port = 1341;
        client_socket_options.local_id = proxy_client_id;
        socket_options[Proxy::SocketRole::CLIENT] = client_socket_options;

        std::string public_key = "my_pub_key";
        std::string secret_key = "my_priv_key";
        std::string server_key = "my_serv_key";
        CredentialFactory cred_factory;

        std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
        cred_options[CredentialType::PUBLIC_KEY] = public_key;
        cred_options[CredentialType::PRIVATE_KEY] = secret_key;
        cred_options[CredentialType::SERVER_KEY] = server_key;

        client_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
        socket_credentials[Proxy::SocketRole::CLIENT] = client_credentials.get();
        }

        // Credentials are allocated on the heap, to ensure they last until the end of
        // the test they must be defined outside of the scope block below
        std::unique_ptr<ICredentials> server_credentials;

        { // Proxy Server Credentials and Socket Options - these options are used
          // to define the server socket that the proxy will use to communicate with
          // the frontend. The proxy acts like a server to the frontend
          SocketOptions server_socket_options;
          server_socket_options.scheme = URIScheme::INPROC;
          server_socket_options.class_type = SocketClassType::SERVER; 
          server_socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
          server_socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
          server_socket_options.protocol_type = ProtocolType::ZQTP; 
          server_socket_options.host = channel_between_proxy_and_frontend;
          server_socket_options.port = 1341;
          server_socket_options.local_id = proxy_server_id;
          socket_options[Proxy::SocketRole::SERVER] = server_socket_options;

          std::string public_key = "my_pub_key";
          std::string secret_key = "my_priv_key";
          std::string server_key = "my_serv_key";
          CredentialFactory cred_factory;

          std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
          cred_options[CredentialType::PUBLIC_KEY] = public_key;
          cred_options[CredentialType::PRIVATE_KEY] = secret_key;
          cred_options[CredentialType::SERVER_KEY] = server_key;

          server_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
          socket_credentials[Proxy::SocketRole::SERVER] = server_credentials.get();

        }

        // Because the (NON Proxy) server will not be a ROUTER we need to add
        // an operator so the proxy server will be added as a router in the 
        // routing message
        //
        // Will add
        //
        // "MiddleMan_client_socket" as a prepended message on its way to the 
        // backend server, I think this is only necessary because we have
        // specifiedt that the Server is connecting Synchronously with the proxy
        OperatorFactory oper_factory;
        std::any router_id_to_add = proxy_client_id;
        std::vector<std::unique_ptr<IOperator>> incoming_operators;
        incoming_operators.push_back( oper_factory.create(OperatorType::RouterBookKeeping, router_id_to_add) );

        Proxy proxy(socket_options, socket_credentials, std::move(incoming_operators));

        std::chrono::duration<double> duration = std::chrono::milliseconds(30);
        proxy.setRunDuration(duration);
        proxy.run();

      // Pass the arguments to the Thread
      }, proxy_client_id, proxy_server_id
  ));

//  try {
    const std::string id = "royal_messenger";
    const std::string key = "skeleton";
    const std::string token = "chest_of_gold";
    MessageFactory msg_factory;
    /// Send the message via the proxy server
    {
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
      while ( response.time_out ) {
        response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
      }

      BOOST_CHECK( response.time_out == false);
      BOOST_CHECK( response.error == false);

      //std::cout << "Key is " << response.message->get(MessageAttribute::KEY) << std::endl;
      //std::cout << "ID is " << response.message->get(MessageAttribute::ID) << std::endl;
      BOOST_CHECK( response.message->get(MessageAttribute::KEY).compare(key) == 0);
      BOOST_CHECK( response.message->get(MessageAttribute::ID).compare(id) == 0);

      const auto & routes = response.message->getRoutes();
      //std::cout << "Routes are " << std::endl;
      for( const auto & route : routes ) {
        std::cout << route << std::endl;
      }

      BOOST_CHECK(routes.at(0).compare(proxy_client_id) == 0);
      BOOST_CHECK(routes.at(1).compare(client_id) == 0);
      // Should have been recorded that the message was passed via two different
      // clients, Use require because we don't want the proxy to continue to run
      BOOST_REQUIRE( routes.size() == 2);

      BOOST_CHECK(response.message->get(MessageAttribute::ID).compare(id) == 0);
      BOOST_CHECK(response.message->get(MessageAttribute::KEY).compare(key) == 0);

      
      //auto auth_by_tok_req = std::get<Anon::AuthenticateByTokenRequest *>(response.message->getPayload());
      //BOOST_CHECK( auth_by_tok_req->token().compare(token) == 0);
      //Anon::AuthenticateByTokenRequest auth_by_token_req;
      //std::cout << "Frontend sending message" << std::endl;
      //client->send(msg_from_client);
    }
    //sleep(2);
    proxy_thread->join();
/*  } catch (...) {
    std::cout << "Catching exception should now kill everything so proxy does not run forever" << std::endl;
    std::terminate();
  }*/
}


BOOST_AUTO_TEST_CASE( testing_Proxy2 ) {

  /**
   * The only difference between this test and the one above is that the final
   * server is using Asynchronous communication and is not using any operators
   * to handle the routing.
   *
   *                                      Here communication is now
   *                                             Asynchronous
   * Client -> Server Socket - Proxy - Client Proxy -> Actual Server
   **/
  const std::string channel_between_proxy_and_backend = "channeltobackend2";
  const std::string channel_between_proxy_and_frontend = "channeltofrontend2";
  CommunicatorFactory factory;

  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::SERVER; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = channel_between_proxy_and_backend;
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
    socket_options.host = channel_between_proxy_and_frontend;
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

    // Make it wait forever
    uint32_t timeout_on_receive = -1;
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


  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread = std::unique_ptr<std::thread>(new std::thread(
        [](const std::string proxy_client_id, const std::string proxy_server_id) { 

        std::unordered_map<Proxy::SocketRole, SocketOptions> socket_options;
        std::unordered_map<Proxy::SocketRole, ICredentials *> socket_credentials;

        const std::string channel_between_proxy_and_backend = "channeltobackend2";
        const std::string channel_between_proxy_and_frontend = "channeltofrontend2";
        // Credentials are allocated on the heap, to ensure they last until the end of
        // the test they must be defined outside of the scope block below
        std::unique_ptr<ICredentials> client_credentials;

        { // Proxy Client Credentials and Socket Options - these options are used
        // to define the client socket that the proxy will use to communicate with
        // the backend. The proxy acts like a client to the backend
        SocketOptions client_socket_options;
        client_socket_options.scheme = URIScheme::INPROC;
        client_socket_options.class_type = SocketClassType::CLIENT; 
        client_socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
        client_socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
        client_socket_options.protocol_type = ProtocolType::ZQTP; 
        client_socket_options.host = channel_between_proxy_and_backend;
        client_socket_options.port = 1341;
        client_socket_options.local_id = proxy_client_id;
        socket_options[Proxy::SocketRole::CLIENT] = client_socket_options;

        std::string public_key = "my_pub_key";
        std::string secret_key = "my_priv_key";
        std::string server_key = "my_serv_key";
        CredentialFactory cred_factory;

        std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
        cred_options[CredentialType::PUBLIC_KEY] = public_key;
        cred_options[CredentialType::PRIVATE_KEY] = secret_key;
        cred_options[CredentialType::SERVER_KEY] = server_key;

        client_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
        socket_credentials[Proxy::SocketRole::CLIENT] = client_credentials.get();
        }

        // Credentials are allocated on the heap, to ensure they last until the end of
        // the test they must be defined outside of the scope block below
        std::unique_ptr<ICredentials> server_credentials;

        { // Proxy Server Credentials and Socket Options - these options are used
          // to define the server socket that the proxy will use to communicate with
          // the frontend. The proxy acts like a server to the frontend
          SocketOptions server_socket_options;
          server_socket_options.scheme = URIScheme::INPROC;
          server_socket_options.class_type = SocketClassType::SERVER; 
          server_socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
          server_socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
          server_socket_options.protocol_type = ProtocolType::ZQTP; 
          server_socket_options.host = channel_between_proxy_and_frontend;
          server_socket_options.port = 1341;
          server_socket_options.local_id = proxy_server_id;
          socket_options[Proxy::SocketRole::SERVER] = server_socket_options;

          std::string public_key = "my_pub_key";
          std::string secret_key = "my_priv_key";
          std::string server_key = "my_serv_key";
          CredentialFactory cred_factory;

          std::unordered_map<CredentialType, std::variant<std::string>> cred_options;
          cred_options[CredentialType::PUBLIC_KEY] = public_key;
          cred_options[CredentialType::PRIVATE_KEY] = secret_key;
          cred_options[CredentialType::SERVER_KEY] = server_key;

          server_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
          socket_credentials[Proxy::SocketRole::SERVER] = server_credentials.get();

        }

        // Because the (NON Proxy) server will not be a ROUTER we need to add
        // an operator so the proxy server will be added as a router in the 
        // routing message
        //
        // Will add
        //
        // "MiddleMan_client_socket" as a prepended message on its way to the 
        // backend server, I think this is only necessary because we have
        // specifiedt that the Server is connecting Synchronously with the proxy
        //OperatorFactory oper_factory;
        //std::any router_id_to_add = proxy_client_id;
        //std::vector<std::unique_ptr<IOperator>> incoming_operators;
        //incoming_operators.push_back( oper_factory.create(OperatorType::RouterBookKeeping, router_id_to_add) );

        Proxy proxy(socket_options, socket_credentials);

        std::chrono::duration<double> duration = std::chrono::milliseconds(30);
        proxy.setRunDuration(duration);
        proxy.run();

      // Pass the arguments to the Thread
      }, proxy_client_id, proxy_server_id
  ));

//  try {
    const std::string id = "royal_messenger";
    const std::string key = "skeleton";
    const std::string token = "chest_of_gold";
    MessageFactory msg_factory;
    /// Send the message via the proxy server
    {
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
      while ( response.time_out ) {
        response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
      }

      BOOST_CHECK( response.time_out == false);
      BOOST_CHECK( response.error == false);

      //std::cout << "Key is " << response.message->get(MessageAttribute::KEY) << std::endl;
      //std::cout << "ID is " << response.message->get(MessageAttribute::ID) << std::endl;
      BOOST_CHECK( response.message->get(MessageAttribute::KEY).compare(key) == 0);
      BOOST_CHECK( response.message->get(MessageAttribute::ID).compare(id) == 0);

      const auto & routes = response.message->getRoutes();
      //std::cout << "Routes are " << std::endl;
      for( const auto & route : routes ) {
        std::cout << route << std::endl;
      }

      BOOST_CHECK(routes.at(0).compare(proxy_client_id) == 0);
      BOOST_CHECK(routes.at(1).compare(client_id) == 0);
      // Should have been recorded that the message was passed via two different
      // clients, Use require because we don't want the proxy to continue to run
      BOOST_REQUIRE( routes.size() == 2);


      auto google_msg = std::get<::google::protobuf::Message *>(response.message->getPayload());
      auto new_auth_by_pass_req = dynamic_cast<SDMS::Anon::AuthenticateByTokenRequest *>(google_msg);

      BOOST_CHECK( new_auth_by_pass_req->token().compare(token) == 0);

      //Anon::AuthenticateByTokenRequest auth_by_token_req;
      //std::cout << "Frontend sending message" << std::endl;
      //client->send(msg_from_client);
    }
    //sleep(2);
    proxy_thread->join();
/*  } catch (...) {
    std::cout << "Catching exception should now kill everything so proxy does not run forever" << std::endl;
    std::terminate();
  }*/
}
BOOST_AUTO_TEST_SUITE_END()

