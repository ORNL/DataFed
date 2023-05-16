// Local public common includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/ErrorCodes.hpp"
#include "common/ICommunicator.hpp"
#include "common/MessageFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"

// Proto file includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"

// Third party includes
#include <boost/program_options.hpp>

// Standard includes
#include <iostream>
#include <memory>
#include <string>
#include <unistd.h>

using namespace SDMS;
namespace po = boost::program_options;

int main(int a_argc, char **a_argv) {

  bool secure_connection = true;
  uint32_t pause_time = 0;

  po::options_description opts("Options");

  opts.add_options()("help,?", "Show help")("insecure,i",
                                            "Run with insecure communication")(
      "pause,p", po::value<uint32_t>(&pause_time),
      "Pause before running (seconds)");

  po::variables_map opt_map;
  po::store(po::command_line_parser(a_argc, a_argv).options(opts).run(),
            opt_map);
  po::notify(opt_map);

  if (opt_map.count("help")) {
    std::cout << "tcp security test client\n";
    std::cout << "Usage: test_tcp_secure_client [options]\n";
    std::cout << opts << std::endl;
    return 0;
  }
  if (opt_map.count("insecure")) {
    secure_connection = false;
  }

  CommunicatorFactory comm_factory;

  // Client properties
  const std::string client_id = "minion";
  const std::string channel = "localhost";
  const uint16_t port = 7515;

  // Test properties
  // How many tries to retrieve a response before test fails
  const int max_retries = 5;

  // Send message properties
  const std::string id = "Bob";
  const std::string key = "skeleton";
  const std::string token = "magic_token";

  // Expected properties returned to client from server
  const std::string error_msg = "testing_no_error";

  // For these keys you cannot use an arbitrary list of characters
  const std::string client_public_key =
      ")z)e3IqX3P@9X7i[SxVh(/Hte0XW[i)5:N=jSzjo";  // 40 chars - must be a legit
                                                   // pub key
  const std::string client_secret_key =
      "lC!Gt)lT:pwGz-blh5>voYFM*QM=jL-4U8kg3B4%";  // 40 chars - must be a legit
                                                   // priv key
  const std::string server_public_key =
      "^88D{p={]#L[}-P/s$4xoOtDQ[)=O%(]+cjONF]*";  // 40 chars - must be a legit
                                                   // pub key
  const std::string server_private_key =
      "F(e/^D^oi}Bsy-Ari=N<}[Z9z658BtdH8nE:Ly1=";  // 40 chars - must be a legit
                                                   // priv key

  // Create the Client Communicator
  auto client = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.protocol_type = ProtocolType::ZQTP;
    socket_options.host = channel;
    socket_options.scheme = URIScheme::TCP;
    if (secure_connection) {
      socket_options.connection_security = SocketConnectionSecurity::SECURE;
    } else {
      socket_options.connection_security = SocketConnectionSecurity::INSECURE;
    }
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.port = port;
    socket_options.local_id = client_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = client_public_key;
    cred_options[CredentialType::PRIVATE_KEY] = client_secret_key;
    cred_options[CredentialType::SERVER_KEY] = server_public_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 1000;
    long timeout_on_poll = 100;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    return comm_factory.create(socket_options, *credentials, timeout_on_receive,
                               timeout_on_poll);
  }();

  std::cout << "Client created: " << client->id() << std::endl;
  std::cout << "Client properties" << std::endl;
  std::cout << "Secure connection " << secure_connection << std::endl;
  if (secure_connection) {
    std::cout << "Client Public key " << client_public_key << std::endl;
    std::cout << "Client Secret key " << client_secret_key << std::endl;
    std::cout << "Server Public key " << server_public_key << std::endl;
  }
  std::cout << "Address           " << client->address() << std::endl;
  std::cout << std::endl;

  std::cout << client->id() << " Calling send..." << std::endl;
  std::cout << "Message content" << std::endl;
  std::cout << "id:     " << id << std::endl;
  std::cout << "key:    " << key << std::endl;
  std::cout << "token:  " << token << std::endl;

  // Before beginning sleep for 1 second
  sleep(pause_time);

  MessageFactory msg_factory;
  {  // Client send
    auto msg_from_client =
        msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
    msg_from_client->set(MessageAttribute::ID, id);
    msg_from_client->set(MessageAttribute::KEY, key);

    uint16_t context = 0;
    msg_from_client->set(constants::message::google::CONTEXT, context);

    auto auth_by_token_req =
        std::make_unique<Anon::AuthenticateByTokenRequest>();
    auth_by_token_req->set_token(token);

    msg_from_client->setPayload(std::move(auth_by_token_req));
    client->send(*msg_from_client);
  }
  std::cout << client->id() << " Message sent..." << std::endl;

  std::cout << client->id() << " Waiting for response from server..."
            << std::endl;
  {  // Receive a NACK response
    ICommunicator::Response response_client =
        client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

    int retry_count = 0;
    while (response_client.time_out == true && retry_count < max_retries) {
      response_client = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
      retry_count++;
    }

    if (response_client.time_out == true) {
      std::cout << client->id() << " FAILED" << std::endl;
      EXCEPT_PARAM(1,
                   "TCP Secure test failed client never received a response "
                   "from server.");
    } else {
      std::cout << client->id() << " Message received from server..."
                << std::endl;
    }

    if (response_client.error) {
      std::cout << client->id() << " FAILED" << std::endl;
      EXCEPT_PARAM(1, "TCP Secure test failed error detected.");
    }

    auto response_google_msg_ptr = std::get<::google::protobuf::Message *>(
        response_client.message->getPayload());
    Anon::NackReply *response_payload =
        dynamic_cast<Anon::NackReply *>(response_google_msg_ptr);

    std::cout << client->id()
              << " Validating message content received from server..."
              << std::endl;

    if (response_payload->err_code() != ErrorCode::ID_SERVICE_ERROR) {
      std::cout << client->id() << " FAILED" << std::endl;
      EXCEPT_PARAM(1,
                   "TCP Secure test failed unexpected ErrorCode returned by "
                   "NACK reply from server, client failing.");
    }
    if (response_payload->err_msg().compare(error_msg) != 0) {
      std::cout << client->id() << " FAILED" << std::endl;
      EXCEPT_PARAM(1,
                   "TCP Secure test failed unexpected error message returned "
                   "from server provided: "
                       << response_payload->err_msg()
                       << " Expected: " << error_msg);
    }
  }
  std::cout << client->id() << " SUCCESS" << std::endl;
  return 0;
}
