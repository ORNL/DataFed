#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE proxy_basic_zmq
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "support/zeromq/Context.hpp"

// Local public includes
#include "CommunicatorFactory.hpp"
#include "CredentialFactory.hpp"
#include "ICredentials.hpp"
#include "IOperator.hpp"
#include "MessageFactory.hpp"
#include "OperatorFactory.hpp"
#include "OperatorTypes.hpp"
#include "servers/ProxyBasicZMQ.hpp"
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


const std::string public_key = "gH1mt*%<[]e.7N6xooFI03j1h[2!wd?o!QE4[+Ra"; // 40 chars
const std::string secret_key = "db2LbwJxCP<4kH7sIQiH/#y]<&F0Bn7tz4F3rTSx"; // 40 chars
const std::string server_key = "AX0D+@G+P$Wv.<W^bu05y<4I++lKN!4<j+=wxe}0"; // 40 chars

BOOST_AUTO_TEST_SUITE(ProxyBasicZMQTest)

BOOST_AUTO_TEST_CASE( testing_ProxyBasicZMQ ) {

  { // Extra scope here is so that the destructors of all items will be called
    // you can then run zmq_ctx_destroy(context) to ensure that all sockets
    // were correctly closed
    // If it hangs it means you missed one

  const std::string frontend_channel = "proxy_frontend";
  const std::string backend_channel = "proxy_backend";
  CommunicatorFactory factory;

  const std::string server_id = "overlord";
  auto server = [&](const std::string backend_channel) {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::SERVER; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::SYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = backend_channel;
    //socket_options.port = 1341;
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
    return factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
        timeout_on_poll);
  }(backend_channel);

  const std::string client_id = "minion";
  auto client = [&](const std::string frontend_channel) {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::CLIENT; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = frontend_channel; //channel_between_proxy_and_frontend;
    //socket_options.port = 1341;
    socket_options.local_id = client_id;

    CredentialFactory cred_factory;
    std::unordered_map<CredentialType, std::string> cred_options;
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
  }(frontend_channel);


  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread = std::unique_ptr<std::thread>(new std::thread(
        [](const std::string proxy_client_id,
          const std::string proxy_server_id,
          const std::string backend_channel,
          const std::string frontend_channel) { 

        std::unordered_map<SocketRole, SocketOptions> socket_options;
        std::unordered_map<SocketRole, ICredentials *> socket_credentials;

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
        client_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
        client_socket_options.protocol_type = ProtocolType::ZQTP; 
        client_socket_options.host = backend_channel;
//        client_socket_options.port = 1341;
        client_socket_options.local_id = proxy_client_id;
        socket_options[SocketRole::CLIENT] = client_socket_options;

        CredentialFactory cred_factory;
        std::unordered_map<CredentialType, std::string> cred_options;
        cred_options[CredentialType::PUBLIC_KEY] = public_key;
        cred_options[CredentialType::PRIVATE_KEY] = secret_key;
        cred_options[CredentialType::SERVER_KEY] = server_key;

        client_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
        socket_credentials[SocketRole::CLIENT] = client_credentials.get();
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
          server_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
          server_socket_options.protocol_type = ProtocolType::ZQTP; 
          server_socket_options.host = frontend_channel;
          //server_socket_options.port = 1341;
          server_socket_options.local_id = proxy_server_id;
          socket_options[SocketRole::SERVER] = server_socket_options;

          CredentialFactory cred_factory;
          std::unordered_map<CredentialType, std::string> cred_options;
          cred_options[CredentialType::PUBLIC_KEY] = public_key;
          cred_options[CredentialType::PRIVATE_KEY] = secret_key;
          cred_options[CredentialType::SERVER_KEY] = server_key;

          server_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
          socket_credentials[SocketRole::SERVER] = server_credentials.get();

        }

        ProxyBasicZMQ proxy(socket_options, socket_credentials);

        std::chrono::duration<double> duration = std::chrono::milliseconds(400);
        proxy.setRunDuration(duration);
        proxy.run();

        // Pass the arguments to the Thread
        }, proxy_client_id, proxy_server_id, backend_channel, frontend_channel
  ));

  const std::string id = "royal_messenger";
  const std::string key = "skeleton";
  const std::string token = "chest_of_gold";
  MessageFactory msg_factory;
  // Client send
  auto msg_from_client = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  msg_from_client->set(MessageAttribute::ID, id);
  msg_from_client->set(MessageAttribute::KEY, key);
  auto auth_by_token_req = std::make_unique<Anon::AuthenticateByTokenRequest>();
  auth_by_token_req->set_token(token);
  msg_from_client->setPayload(std::move(auth_by_token_req));

  std::this_thread::sleep_for (std::chrono::milliseconds(100));
  client->send(*msg_from_client);
  // Client send

  { // Server receive
    ICommunicator::Response response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

    std::chrono::duration<double> duration = std::chrono::milliseconds(50);
    auto end_time = std::chrono::steady_clock::now() + duration;
    while ( response.time_out and end_time > std::chrono::steady_clock::now() ) {
      response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    }

    BOOST_CHECK( response.time_out == false);
    BOOST_CHECK( response.error == false);

    BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::KEY)).compare(key) == 0);
    BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::ID)).compare(id) == 0);

    const auto & routes = response.message->getRoutes();
    std::cout << "Unfortunately, there is no way to get the routing id when the ZMQ implemnetation of a proxy server is used." << std::endl;
    std::cout << "There should be no routes, if they exist they are:" << std::endl;
    for( const auto & route : routes ) {
      std::cout << route << std::endl;
    }

    // Should have been recorded that the message was passed via two different
    // clients, Use require because we don't want the proxy to continue to run
    BOOST_REQUIRE( routes.size() == 0);

    BOOST_CHECK(std::get<std::string>(response.message->get(MessageAttribute::ID)).compare(id) == 0);
    BOOST_CHECK(std::get<std::string>(response.message->get(MessageAttribute::KEY)).compare(key) == 0);

    auto google_msg = std::get<::google::protobuf::Message *>(response.message->getPayload());
    auto new_auth_by_pass_req = dynamic_cast<SDMS::Anon::AuthenticateByTokenRequest *>(google_msg);

    BOOST_CHECK( new_auth_by_pass_req->token().compare(token) == 0);
  } // Server receive
  proxy_thread->join();
  }
  //std::cout << "GET CONTEXT and exit" << std::endl;
  //auto context = getContext();
  //zmq_ctx_destroy(context);
}

BOOST_AUTO_TEST_CASE( testing_ProxyBasicZMQ_Reply ) {

  { // Extra scope here is so that the destructors of all items will be called
    // you can then run zmq_ctx_destroy(context) to ensure that all sockets
    // were correctly closed
    // If it hangs it means you missed one
  std::cout << "\nBasic ZMQ Proxy Reply Test" << std::endl;
  std::cout << "********************************\n" << std::endl;
  const std::string frontend_channel = "proxy_frontend_2";
  const std::string backend_channel = "proxy_backend_2";
  CommunicatorFactory factory;

  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;
  const std::string server_id = "overlord";
  auto server = [&](const std::string backend_channel) {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::SERVER; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::SYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = backend_channel;
    //socket_options.port = 1341;
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
    return factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
        timeout_on_poll);
  }(backend_channel);

  const std::string client_id = "minion";
  auto client = [&](const std::string frontend_channel) {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::INPROC;
    socket_options.class_type = SocketClassType::CLIENT; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = frontend_channel; //channel_between_proxy_and_frontend;
    //socket_options.port = 1341;
    socket_options.local_id = client_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
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
  }(frontend_channel);

  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;

  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread = std::unique_ptr<std::thread>(new std::thread(
        [](const std::string proxy_client_id,
          const std::string proxy_server_id,
          const std::string backend_channel,
          const std::string frontend_channel) { 

        std::unordered_map<SocketRole, SocketOptions> socket_options;
        std::unordered_map<SocketRole, ICredentials *> socket_credentials;

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
        client_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
        client_socket_options.protocol_type = ProtocolType::ZQTP; 
        client_socket_options.host = backend_channel;
//        client_socket_options.port = 1341;
        client_socket_options.local_id = proxy_client_id;
        socket_options[SocketRole::CLIENT] = client_socket_options;

        CredentialFactory cred_factory;

        std::unordered_map<CredentialType, std::string> cred_options;
        cred_options[CredentialType::PUBLIC_KEY] = public_key;
        cred_options[CredentialType::PRIVATE_KEY] = secret_key;
        cred_options[CredentialType::SERVER_KEY] = server_key;

        client_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
        socket_credentials[SocketRole::CLIENT] = client_credentials.get();
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
          server_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
          server_socket_options.protocol_type = ProtocolType::ZQTP; 
          server_socket_options.host = frontend_channel;
          //server_socket_options.port = 1341;
          server_socket_options.local_id = proxy_server_id;
          socket_options[SocketRole::SERVER] = server_socket_options;

          CredentialFactory cred_factory;

          std::unordered_map<CredentialType, std::string> cred_options;
          cred_options[CredentialType::PUBLIC_KEY] = public_key;
          cred_options[CredentialType::PRIVATE_KEY] = secret_key;
          cred_options[CredentialType::SERVER_KEY] = server_key;

          server_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
          socket_credentials[SocketRole::SERVER] = server_credentials.get();

        }

        ProxyBasicZMQ proxy(socket_options, socket_credentials);

        std::chrono::duration<double> duration = std::chrono::milliseconds(1000);
        proxy.setRunDuration(duration);
        proxy.run();

        // Pass the arguments to the Thread
        }, proxy_client_id, proxy_server_id, backend_channel, frontend_channel
  ));
  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;

  const std::string id = "royal_messenger";
  const std::string key = "skeleton";
  const std::string token = "chest_of_gold";
  const std::string error_msg = "testing_no_error";
  MessageFactory msg_factory;

   // Client send
    auto msg_from_client = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);
    auto auth_by_token_req = std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);
    msg_from_client->setPayload(std::move(auth_by_token_req));

    std::this_thread::sleep_for (std::chrono::milliseconds(500));
    client->send(*msg_from_client);
   // Client send

  // Server receive
    ICommunicator::Response response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

    std::chrono::duration<double> duration = std::chrono::milliseconds(50);
    auto end_time = std::chrono::steady_clock::now() + duration;
    while ( response.time_out and end_time > std::chrono::steady_clock::now() ) {
      response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    }

    BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::KEY)).compare(key) == 0);
    BOOST_CHECK( std::get<std::string>(response.message->get(MessageAttribute::ID)).compare(id) == 0);

    // Now we are going to turn the message around and send a response back 
    // from the "overlord" server to the client "minion" via two hops through
    // the proxy chain
    auto return_msg = msg_factory.createResponseEnvelope(*response.message);
    // We will just pass a nack reply because it is easy
    auto nack_reply = std::make_unique<Anon::NackReply>();
    nack_reply->set_err_code(ErrorCode::ID_SERVICE_ERROR);
    nack_reply->set_err_msg(error_msg);

    // Place google proto message in IMessage
    return_msg->setPayload(std::move(nack_reply));
    return_msg->set(MessageAttribute::ID, id);
    return_msg->set(MessageAttribute::KEY, key);
    server->send(*return_msg);

  // Server receive

  auto msg_from_server = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  std::cout << "RECEIVED ******************************" << std::endl;
  BOOST_CHECK( msg_from_server.time_out == false);
  BOOST_CHECK( msg_from_server.error == false);
  // At this point there should be no routes
  BOOST_CHECK( msg_from_server.message->getRoutes().size() == 0);

  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;
  auto response_google_msg_ptr = std::get<::google::protobuf::Message *>(msg_from_server.message->getPayload());
  Anon::NackReply * response_payload = dynamic_cast<Anon::NackReply *>(response_google_msg_ptr);

  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;
  BOOST_CHECK( response_payload->err_code() == ErrorCode::ID_SERVICE_ERROR);
  BOOST_CHECK( response_payload->err_msg().compare(error_msg) == 0);
  
  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;
  std::this_thread::sleep_for (std::chrono::milliseconds(1500));
  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;
  proxy_thread->join();
  std::cout << __FILE__ << ":" << __LINE__ <<std::endl;
  }
  std::cout << "GET CONTEXT and exit" << std::endl;
  auto context = getContext();
  zmq_ctx_destroy(context);
}

BOOST_AUTO_TEST_SUITE_END()
