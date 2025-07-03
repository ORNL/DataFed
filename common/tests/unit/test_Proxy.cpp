#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE proxy
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local private includes
#include "servers/Proxy.hpp"

// Local public includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/ICredentials.hpp"
#include "common/IOperator.hpp"
#include "common/MessageFactory.hpp"
#include "common/OperatorFactory.hpp"
#include "common/OperatorTypes.hpp"
#include "common/SocketOptions.hpp"

// Proto file includes
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"

// Standard includes
#include <memory>
#include <string>
#include <thread>
#include <unordered_map>

using namespace SDMS;

SocketOptions baseClientOptions() {
  SocketOptions socket_options;
  socket_options.scheme = URIScheme::INPROC;
  socket_options.class_type = SocketClassType::CLIENT;
  socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
  socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
  socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
  socket_options.protocol_type = ProtocolType::ZQTP;
  return socket_options;
}

SocketOptions baseServerOptions() {
  SocketOptions socket_options;
  socket_options.scheme = URIScheme::INPROC;
  socket_options.class_type = SocketClassType::SERVER;
  socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
  socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
  socket_options.connection_life = SocketConnectionLife::PERSISTENT;
  socket_options.protocol_type = ProtocolType::ZQTP;
  return socket_options;
}

const std::string public_key =
    "pF&3ZS3rd2HYesV&KbDEb7T@RaHhcZD@FDwqef9f"; // 40 chars
const std::string secret_key =
    "*XFVZrCnhPd5DrQTZ!V%zqZoPfs@8pcP23l3kfei"; // 40 chars
const std::string server_key =
    "Wce6y$B4vXjM$xnM^tRGJGP^ads5hxkDSULJWM&9"; // 40 chars

struct GlobalProtobufTeardown {
    ~GlobalProtobufTeardown() {
        // This is the teardown function that runs once at the end
        google::protobuf::ShutdownProtobufLibrary();
    }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);

BOOST_AUTO_TEST_SUITE(ProxyTest)

BOOST_AUTO_TEST_CASE(testing_Proxy) {

  const std::string channel_between_proxy_and_backend = "channeltobackend";
  const std::string channel_between_proxy_and_frontend = "channeltofrontend";

  LogContext log_context;
  log_context.thread_name = "test_proxy_thread";
  CommunicatorFactory factory(log_context);

  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = baseServerOptions();
    socket_options.communication_type = SocketCommunicationType::SYNCHRONOUS;
    socket_options.host = channel_between_proxy_and_backend;
    socket_options.port = 1341;
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
    SocketOptions socket_options = baseClientOptions();
    socket_options.host = channel_between_proxy_and_frontend;
    socket_options.port = 1341;
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
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread =
      std::unique_ptr<std::thread>(new std::thread(
          [](const std::string proxy_client_id,
             const std::string proxy_server_id) {
            std::unordered_map<SocketRole, SocketOptions> socket_options;
            std::unordered_map<SocketRole, ICredentials *> socket_credentials;

            const std::string channel_between_proxy_and_backend =
                "channeltobackend";
            const std::string channel_between_proxy_and_frontend =
                "channeltofrontend";
            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> client_credentials;

            { // Proxy Client Credentials and Socket Options - these options are
              // used
              // to define the client socket that the proxy will use to
              // communicate with the backend. The proxy acts like a client to
              // the backend
              SocketOptions client_socket_options = baseClientOptions();
              client_socket_options.host = channel_between_proxy_and_backend;
              client_socket_options.port = 1341;
              client_socket_options.local_id = proxy_client_id;
              socket_options[SocketRole::CLIENT] = client_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              client_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::CLIENT] = client_credentials.get();
            }

            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> server_credentials;

            { // Proxy Server Credentials and Socket Options - these options are
              // used
              // to define the server socket that the proxy will use to
              // communicate with the frontend. The proxy acts like a server to
              // the frontend
              SocketOptions server_socket_options = baseServerOptions();
              server_socket_options.host = channel_between_proxy_and_frontend;
              server_socket_options.port = 1341;
              server_socket_options.local_id = proxy_server_id;
              socket_options[SocketRole::SERVER] = server_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              server_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::SERVER] = server_credentials.get();
            }

            // Because the (NON-Proxy) server will not be a ROUTER we need to
            // add an operator so the proxy server will be added as a router in
            // the routing part of the message
            //
            // Will add
            //
            // "MiddleMan_client_socket" as a prepended message on its way to
            // the backend server, I think this is only necessary because we
            // have specified that the Server is connecting Synchronously with
            // the proxy
            OperatorFactory oper_factory;
            std::any router_id_to_add = proxy_client_id;
            std::vector<std::unique_ptr<IOperator>> incoming_operators;
            incoming_operators.push_back(oper_factory.create(
                OperatorType::RouterBookKeeping, router_id_to_add));

            LogContext log_context_proxy;
            log_context_proxy.thread_name = "proxy_thread";
            log_context_proxy.thread_id = 1;
            Proxy proxy(socket_options, socket_credentials,
                        std::move(incoming_operators), log_context_proxy);

            std::chrono::duration<double> duration =
                std::chrono::milliseconds(100);
            proxy.setRunDuration(duration);
            proxy.run();

            // Pass the arguments to the Thread
          },
          proxy_client_id, proxy_server_id));

  const std::string id = "royal_messenger";
  const std::string key = "skeleton";
  const std::string token = "chest_of_gold";
  // This is so the client knows when the response is sent what request it is
  // associated with
  const uint16_t context = 2;
  MessageFactory msg_factory;
  { // Client send
    auto msg_from_client =
        msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);
    msg_from_client->set(constants::message::google::CONTEXT, context);
    auto auth_by_token_req =
        std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);
    msg_from_client->setPayload(std::move(auth_by_token_req));
    client->send(*msg_from_client);
  } // Client send

  { // Server receive
    ICommunicator::Response response =
        server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    while (response.time_out) {
      response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    }

    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);

    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);

    const auto &routes = response.message->getRoutes();
    std::cout << "Routes are:" << std::endl;
    for (const auto &route : routes) {
      std::cout << route << std::endl;
    }

    BOOST_CHECK(routes.front().compare(proxy_client_id) == 0);
    BOOST_CHECK(routes.back().compare(client_id) == 0);
    // Should have been recorded that the message was passed via two different
    // clients, Use require because we don't want the proxy to continue to run
    BOOST_REQUIRE(routes.size() == 2);

    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(std::get<uint16_t>(response.message->get(
                    constants::message::google::CONTEXT)) == context);

  } // Server receive
  proxy_thread->join();
}

BOOST_AUTO_TEST_CASE(testing_Proxy2) {

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

  LogContext log_context;
  log_context.thread_name = "test_proxy2_thread";
  CommunicatorFactory factory(log_context);

  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = baseServerOptions();
    socket_options.host = channel_between_proxy_and_backend;
    socket_options.port = 1341;
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
    SocketOptions socket_options = baseClientOptions();
    socket_options.host = channel_between_proxy_and_frontend;
    socket_options.port = 1341;
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
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread =
      std::unique_ptr<std::thread>(new std::thread(
          [](const std::string proxy_client_id,
             const std::string proxy_server_id) {
            std::unordered_map<SocketRole, SocketOptions> socket_options;
            std::unordered_map<SocketRole, ICredentials *> socket_credentials;

            const std::string channel_between_proxy_and_backend =
                "channeltobackend2";
            const std::string channel_between_proxy_and_frontend =
                "channeltofrontend2";
            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> client_credentials;

            { // Proxy Client Credentials and Socket Options - these options are
              // used
              // to define the client socket that the proxy will use to
              // communicate with the backend. The proxy acts like a client to
              // the backend
              SocketOptions client_socket_options = baseClientOptions();
              client_socket_options.host = channel_between_proxy_and_backend;
              client_socket_options.port = 1341;
              client_socket_options.local_id = proxy_client_id;
              socket_options[SocketRole::CLIENT] = client_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              client_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::CLIENT] = client_credentials.get();
            }

            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> server_credentials;

            { // Proxy Server Credentials and Socket Options - these options are
              // used
              // to define the server socket that the proxy will use to
              // communicate with the frontend. The proxy acts like a server to
              // the frontend
              SocketOptions server_socket_options = baseServerOptions();
              server_socket_options.host = channel_between_proxy_and_frontend;
              server_socket_options.port = 1341;
              server_socket_options.local_id = proxy_server_id;
              socket_options[SocketRole::SERVER] = server_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              server_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::SERVER] = server_credentials.get();
            }

            LogContext log_context_proxy_middle;
            log_context_proxy_middle.thread_name = "middleman";
            log_context_proxy_middle.thread_id = 1;
            Proxy proxy(socket_options, socket_credentials,
                        log_context_proxy_middle);

            std::chrono::duration<double> duration =
                std::chrono::milliseconds(30);
            proxy.setRunDuration(duration);
            proxy.run();

            // Pass the arguments to the Thread
          },
          proxy_client_id, proxy_server_id));

  const std::string id = "royal_messenger";
  const std::string key = "skeleton";
  const std::string token = "chest_of_gold";
  MessageFactory msg_factory;

  { // Client Send
    auto msg_from_client =
        msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);
    auto auth_by_token_req =
        std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);
    msg_from_client->setPayload(std::move(auth_by_token_req));
    client->send(*msg_from_client);
  } // Client Send

  { // Server receive
    ICommunicator::Response response =
        server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    while (response.time_out) {
      response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    }

    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);

    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);

    const auto &routes = response.message->getRoutes();
    std::cout << "Routes are:" << std::endl;
    for (const auto &route : routes) {
      std::cout << route << std::endl;
    }

    BOOST_CHECK(routes.front().compare(proxy_client_id) == 0);
    BOOST_CHECK(routes.back().compare(client_id) == 0);
    // Should have been recorded that the message was passed via two different
    // clients, Use require because we don't want the proxy to continue to run
    BOOST_REQUIRE(routes.size() == 2);

    auto google_msg =
        std::get<::google::protobuf::Message *>(response.message->getPayload());
    auto new_auth_by_pass_req =
        dynamic_cast<SDMS::Anon::AuthenticateByTokenRequest *>(google_msg);

    BOOST_CHECK(new_auth_by_pass_req->token().compare(token) == 0);

  } // Server receive
  proxy_thread->join();
}

BOOST_AUTO_TEST_CASE(testing_ProxyChain) {

  /**
   * The only difference between this test and the one above is that we now have
   * two proxies between the client and server
   *
   **/
  std::cout << "\nStarting testing_ProxyChain" << std::endl;

  std::chrono::duration<double> test_duration = std::chrono::milliseconds(1000);
  const std::string channel_between_proxy_and_backend =
      "channeltobackend_chain";
  const std::string channel_between_proxy_and_frontend =
      "channeltofrontend_chain";

  LogContext log_context_proxy;
  log_context_proxy.thread_name = "test_proxy_chain_thread";
  CommunicatorFactory factory(log_context_proxy);

  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = baseServerOptions();
    socket_options.host = channel_between_proxy_and_backend;
    socket_options.port = 1341;
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
    SocketOptions socket_options = baseClientOptions();
    socket_options.host = channel_between_proxy_and_frontend;
    socket_options.port = 1341;
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
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread =
      std::unique_ptr<std::thread>(new std::thread(
          [](const std::string proxy_client_id,
             const std::string proxy_server_id,
             std::chrono::duration<double> test_duration) {
            std::unordered_map<SocketRole, SocketOptions> socket_options;
            std::unordered_map<SocketRole, ICredentials *> socket_credentials;

            const std::string channel_between_proxies =
                "channelbetween_proxies_chain";
            const std::string channel_between_proxy_and_frontend =
                "channeltofrontend_chain";
            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> client_credentials;

            { // Proxy Client Credentials and Socket Options - these options are
              // used
              // to define the client socket that the proxy will use to
              // communicate with the backend. The proxy acts like a client to
              // the backend
              SocketOptions client_socket_options = baseClientOptions();
              client_socket_options.host = channel_between_proxies;
              client_socket_options.port = 1341;
              client_socket_options.local_id = proxy_client_id;
              socket_options[SocketRole::CLIENT] = client_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              client_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::CLIENT] = client_credentials.get();
            }

            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> server_credentials;

            { // Proxy Server Credentials and Socket Options - these options are
              // used
              // to define the server socket that the proxy will use to
              // communicate with the frontend. The proxy acts like a server to
              // the frontend
              SocketOptions server_socket_options = baseServerOptions();
              server_socket_options.host = channel_between_proxy_and_frontend;
              server_socket_options.port = 1341;
              server_socket_options.local_id = proxy_server_id;
              socket_options[SocketRole::SERVER] = server_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              server_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::SERVER] = server_credentials.get();
            }

            LogContext log_context_proxy1;
            log_context_proxy1.thread_name = "test_proxy1_chain_thread";
            log_context_proxy1.thread_id = 1;
            Proxy proxy(socket_options, socket_credentials, log_context_proxy1);

            proxy.setRunDuration(test_duration);
            proxy.run();

            // Pass the arguments to the Thread
          },
          proxy_client_id, proxy_server_id,
          test_duration)); // thread for first proxy server

  /// Start the proxy
  const std::string proxy_client_id2 = "Senior_MiddleMan_client_socket";
  const std::string proxy_server_id2 = "Senior_MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread2 =
      std::unique_ptr<std::thread>(new std::thread(
          [](const std::string proxy_client_id2,
             const std::string proxy_server_id2,
             std::chrono::duration<double> test_duration) {
            std::unordered_map<SocketRole, SocketOptions> socket_options;
            std::unordered_map<SocketRole, ICredentials *> socket_credentials;

            const std::string channel_between_proxy_and_backend =
                "channeltobackend_chain";
            const std::string channel_between_proxies =
                "channelbetween_proxies_chain";
            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> client_credentials;

            { // Proxy Client Credentials and Socket Options - these options are
              // used
              // to define the client socket that the proxy will use to
              // communicate with the backend. The proxy acts like a client to
              // the backend
              SocketOptions client_socket_options = baseClientOptions();
              client_socket_options.host = channel_between_proxy_and_backend;
              client_socket_options.port = 1341;
              client_socket_options.local_id = proxy_client_id2;
              socket_options[SocketRole::CLIENT] = client_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              client_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::CLIENT] = client_credentials.get();
            }

            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> server_credentials;

            { // Proxy Server Credentials and Socket Options - these options are
              // used
              // to define the server socket that the proxy will use to
              // communicate with the frontend. The proxy acts like a server to
              // the frontend
              SocketOptions server_socket_options = baseServerOptions();
              server_socket_options.host = channel_between_proxies;
              server_socket_options.port = 1341;
              server_socket_options.local_id = proxy_server_id2;
              socket_options[SocketRole::SERVER] = server_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              server_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::SERVER] = server_credentials.get();
            }

            LogContext log_context_proxy2;
            log_context_proxy2.thread_name = "test_proxy2_chain_thread";
            log_context_proxy2.thread_id = 2;
            Proxy proxy(socket_options, socket_credentials, log_context_proxy2);

            proxy.setRunDuration(test_duration);
            proxy.run();

            // Pass the arguments to the Thread
          },
          proxy_client_id2, proxy_server_id2,
          test_duration)); // thread for second proxy server

  const std::string error_msg = "testing_no_error";
  const std::string id = "royal_messenger";
  const std::string key = "skeleton";
  const std::string token = "chest_of_gold";
  MessageFactory msg_factory;
  /// Send the message via the proxy server
  auto msg_from_client =
      msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  msg_from_client->set(MessageAttribute::ID, id);
  msg_from_client->set(MessageAttribute::KEY, key);
  auto auth_by_token_req = std::make_unique<Anon::AuthenticateByTokenRequest>();
  auth_by_token_req->set_token(token);
  msg_from_client->setPayload(std::move(auth_by_token_req));
  client->send(*msg_from_client);

  { // Server receive
    ICommunicator::Response response =
        server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

    auto end_time = std::chrono::steady_clock::now() + test_duration;
    while (response.time_out and
           (end_time > std::chrono::steady_clock::now())) {
      response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    }

    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);

    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);

    const auto &routes = response.message->getRoutes();
    std::cout << "Routes are:" << std::endl;
    for (const auto &route : routes) {
      std::cout << route << std::endl;
    }

    BOOST_CHECK(routes.front().compare(proxy_client_id2) == 0);
    BOOST_CHECK(std::next(routes.begin())->compare(proxy_client_id) == 0);
    BOOST_CHECK(routes.back().compare(client_id) == 0);
    // Should have been recorded that the message was passed via two different
    // clients, Use require because we don't want the proxy to continue to run
    BOOST_REQUIRE(routes.size() == 3);

    auto google_msg =
        std::get<::google::protobuf::Message *>(response.message->getPayload());
    auto new_auth_by_pass_req =
        dynamic_cast<SDMS::Anon::AuthenticateByTokenRequest *>(google_msg);

    BOOST_CHECK(new_auth_by_pass_req->token().compare(token) == 0);

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
    server->send(*return_msg);
  }

  // This is will wait for an infinite amount of time
  auto msg_from_server = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
  BOOST_CHECK(msg_from_server.time_out == false);
  BOOST_CHECK(msg_from_server.error == false);
  // At this point there should be no routes
  BOOST_CHECK(msg_from_server.message->getRoutes().size() == 0);

  auto response_google_msg_ptr = std::get<::google::protobuf::Message *>(
      msg_from_server.message->getPayload());
  Anon::NackReply *response_payload =
      dynamic_cast<Anon::NackReply *>(response_google_msg_ptr);

  BOOST_CHECK(response_payload->err_code() == ErrorCode::ID_SERVICE_ERROR);
  BOOST_CHECK(response_payload->err_msg().compare(error_msg) == 0);

  proxy_thread->join();
  proxy_thread2->join();
}

BOOST_AUTO_TEST_CASE(testing_Proxy_with_PERSISTENT_proxy_client) {

  /**
   * The only difference between this test and the one above is that the final
   * server is using Asynchronous communication and is not using any operators
   * to handle the routing.
   *
   *                                      Here communication is now
   *                                             Asynchronous
   * Client -> Server Socket - Proxy - Client Proxy -> Actual Server
   **/
  const std::string channel_between_proxy_and_backend = "channeltobackend3";
  const std::string channel_between_proxy_and_frontend = "channeltofrontend3";

  LogContext log_context;
  log_context.thread_name = "test_persistent_proxy";
  CommunicatorFactory factory(log_context);

  const std::string server_id = "overlord";
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options = baseServerOptions();
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.host = channel_between_proxy_and_backend;
    socket_options.port = 1341;
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
    SocketOptions socket_options = baseClientOptions();
    socket_options.host = channel_between_proxy_and_frontend;
    socket_options.port = 1341;
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
    return factory.create(socket_options, *credentials, timeout_on_receive,
                          timeout_on_poll);
  }();

  /// Start the proxy
  const std::string proxy_client_id = "MiddleMan_client_socket";
  const std::string proxy_server_id = "MiddleMan_server_socket";
  std::unique_ptr<std::thread> proxy_thread =
      std::unique_ptr<std::thread>(new std::thread(
          [](const std::string proxy_client_id,
             const std::string proxy_server_id) {
            std::unordered_map<SocketRole, SocketOptions> socket_options;
            std::unordered_map<SocketRole, ICredentials *> socket_credentials;

            const std::string channel_between_proxy_and_backend =
                "channeltobackend3";
            const std::string channel_between_proxy_and_frontend =
                "channeltofrontend3";
            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> client_credentials;

            { // Proxy Client Credentials and Socket Options - these options are
              // used
              // to define the client socket that the proxy will use to
              // communicate with the backend. The proxy acts like a client to
              // the backend
              SocketOptions client_socket_options = baseClientOptions();
              client_socket_options.connection_life =
                  SocketConnectionLife::PERSISTENT;
              client_socket_options.host = channel_between_proxy_and_backend;
              client_socket_options.port = 1341;
              client_socket_options.local_id = proxy_client_id;
              socket_options[SocketRole::CLIENT] = client_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              client_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::CLIENT] = client_credentials.get();
            }

            // Credentials are allocated on the heap, to ensure they last until
            // the end of the test they must be defined outside of the scope
            // block below
            std::unique_ptr<ICredentials> server_credentials;

            { // Proxy Server Credentials and Socket Options - these options are
              // used
              // to define the server socket that the proxy will use to
              // communicate with the frontend. The proxy acts like a server to
              // the frontend
              SocketOptions server_socket_options = baseServerOptions();
              server_socket_options.host = channel_between_proxy_and_frontend;
              server_socket_options.port = 1341;
              server_socket_options.local_id = proxy_server_id;
              socket_options[SocketRole::SERVER] = server_socket_options;

              CredentialFactory cred_factory;

              std::unordered_map<CredentialType, std::string> cred_options;
              cred_options[CredentialType::PUBLIC_KEY] = public_key;
              cred_options[CredentialType::PRIVATE_KEY] = secret_key;
              cred_options[CredentialType::SERVER_KEY] = server_key;

              server_credentials =
                  cred_factory.create(ProtocolType::ZQTP, cred_options);
              socket_credentials[SocketRole::SERVER] = server_credentials.get();
            }

            LogContext log_context;
            log_context.thread_name = "test_persistent_proxy1";
            log_context.thread_id = 1;
            Proxy proxy(socket_options, socket_credentials, log_context);

            std::chrono::duration<double> duration =
                std::chrono::milliseconds(30);
            proxy.setRunDuration(duration);
            proxy.run();

            // Pass the arguments to the Thread
          },
          proxy_client_id, proxy_server_id));

  const std::string id = "royal_messenger";
  const std::string key = "skeleton";
  const std::string token = "chest_of_gold";
  MessageFactory msg_factory;

  { // Client Send
    auto msg_from_client =
        msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);
    auto auth_by_token_req =
        std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);
    msg_from_client->setPayload(std::move(auth_by_token_req));
    client->send(*msg_from_client);
  } // Client Send

  { // Server receive
    ICommunicator::Response response =
        server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    while (response.time_out) {
      response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    }

    BOOST_CHECK(response.time_out == false);
    BOOST_CHECK(response.error == false);

    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::KEY))
            .compare(key) == 0);
    BOOST_CHECK(
        std::get<std::string>(response.message->get(MessageAttribute::ID))
            .compare(id) == 0);

    const auto &routes = response.message->getRoutes();
    std::cout << "Routes are:" << std::endl;
    for (const auto &route : routes) {
      std::cout << route << std::endl;
    }

    BOOST_CHECK(routes.front().compare(proxy_client_id) == 0);
    BOOST_CHECK(routes.back().compare(client_id) == 0);
    // Should have been recorded that the message was passed via two different
    // clients, Use require because we don't want the proxy to continue to run
    BOOST_REQUIRE(routes.size() == 2);

    auto google_msg =
        std::get<::google::protobuf::Message *>(response.message->getPayload());
    auto new_auth_by_pass_req =
        dynamic_cast<SDMS::Anon::AuthenticateByTokenRequest *>(google_msg);

    BOOST_CHECK(new_auth_by_pass_req->token().compare(token) == 0);

  } // Server receive
  proxy_thread->join();
}

BOOST_AUTO_TEST_SUITE_END()
