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

int main(int a_argc, char ** a_argv ) {

  bool secure_connection = true;
  uint32_t pause_time = 0;

  po::options_description opts( "Options" );

  opts.add_options()
    ("help,?", "Show help")
    ("insecure,i","Run with insecure communication")
    ("fail,f","Run with insecure communication")
    ("pause,p",po::value<uint32_t>( &pause_time ),"Pause before running (seconds)");

  po::variables_map opt_map;
  po::store( po::command_line_parser( a_argc, a_argv ).options( opts ).run(), opt_map );
  po::notify( opt_map );

  if ( opt_map.count( "help" ) ){
    std::cout << "tcp security test server\n";
    std::cout << "Usage: test_tcp_secure_server [options]\n";
    std::cout << opts << std::endl;
    return 0;
  }
  if ( opt_map.count("insecure") ){
    secure_connection = false;
  }


  CommunicatorFactory comm_factory;

  // Server properties
  const std::string server_id = "overlord";
  const std::string channel = "*";
  const uint16_t port = 7515;

  // Received message properties
  const std::string id = "Bob";
  const std::string key = "skeleton";
  const std::string token = "magic_token";

  // Send message properties
  std::string error_msg = "testing_no_error";

  // For these keys you cannot use an arbitrary list of characters
  const std::string client_public_key  = ")z)e3IqX3P@9X7i[SxVh(/Hte0XW[i)5:N=jSzjo"; // 40 chars - must be a legit pub key 
  const std::string client_secret_key  = "lC!Gt)lT:pwGz-blh5>voYFM*QM=jL-4U8kg3B4%"; // 40 chars - must be a legit priv key
  const std::string server_public_key  = "^88D{p={]#L[}-P/s$4xoOtDQ[)=O%(]+cjONF]*"; // 40 chars - must be a legit pub key
  const std::string server_private_key = "F(e/^D^oi}Bsy-Ari=N<}[Z9z658BtdH8nE:Ly1="; // 40 chars - must be a legit priv key

  // Test properties
  // How many tries to retrieve a response before test fails
  const int max_retries = 5;

  // Create the Server Communicator
  auto server = [&]() {
    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = URIScheme::TCP;
    socket_options.class_type = SocketClassType::SERVER; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::PERSISTENT;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = channel;
    if( secure_connection ) {
      socket_options.connection_security = SocketConnectionSecurity::SECURE;
    } else {
      socket_options.connection_security = SocketConnectionSecurity::INSECURE;
    }
    socket_options.port = port;
    socket_options.local_id = server_id;

    CredentialFactory cred_factory;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PRIVATE_KEY] = server_private_key;

    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    uint32_t timeout_on_receive = 1000;
    long timeout_on_poll = 1000;

    // When creating a communication channel with a client application we need
    // to locally have a server socket. So though we have specified a server
    // socket we will actually be communicating with a client.
    return comm_factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
        timeout_on_poll);
  }();

  std::cout << "Server created: " << server->id() << std::endl;
  std::cout << "Server properties" << std::endl;
  std::cout << "Secure connection  " << secure_connection << std::endl;
  if( secure_connection ) {
    std::cout << "Server private key " << server_private_key << std::endl;
  }
  std::cout << "Address            " << server->address() << std::endl;

  // Before beginning sleep for 1 second
  sleep(pause_time);

  { // Server receive
    ICommunicator::Response response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

    int retry_count = 0;
    while( response.time_out == true && retry_count < max_retries ) {
      response = server->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
      retry_count++;
      std::cout << "Retry count " << retry_count << " Time out " << response.time_out << std::endl;
    }

    if( response.time_out == true ) {
      std::cout << server->id() << " FAILED" << std::endl;
      EXCEPT_PARAM(1, "TCP Secure test failed server never received initial request from client.");      
    } else {
      std::cout << server->id() << " Message received from client..." << std::endl;
    }

    if( response.error) {
      std::cout << server->id() << " FAILED" << std::endl;
      EXCEPT_PARAM(1, "TCP Secure test failed error detected.");
    }

    std::cout << server->id() << " received key: " << std::get<std::string>(response.message->get(MessageAttribute::KEY)) << std::endl;
    std::cout << server->id() << " received id: " << std::get<std::string>(response.message->get(MessageAttribute::ID)) << std::endl;

    const auto & routes = response.message->getRoutes();

    std::cout << std::endl;
    std::cout << "Server route identification list" << std::endl;
    for( const auto & route : routes ) {
      std::cout << route << std::endl;
    }
    std::cout << std::endl;

    auto google_msg_ptr = std::get<::google::protobuf::Message *>(response.message->getPayload());
    Anon::AuthenticateByTokenRequest * payload = dynamic_cast<Anon::AuthenticateByTokenRequest *>(google_msg_ptr);

    if(payload->token().compare(token) != 0) {
      std::cout << server->id() << " FAILED" << std::endl;
      EXCEPT_PARAM(1, "Error detected in server, expected message content is incorrect. Actual token value is " << payload->token() << " Expected token value is " << token);
    }

    MessageFactory msg_factory;
    // Server send a reply
    auto nack_msg = msg_factory.createResponseEnvelope(*response.message);

    // Create Google proto message
    auto nack_reply = std::make_unique<Anon::NackReply>();
    nack_reply->set_err_code(ErrorCode::ID_SERVICE_ERROR);
    nack_reply->set_err_msg(error_msg);

    // Place google proto message in IMessage
    nack_msg->setPayload(std::move(nack_reply));

    server->send(*nack_msg);
  }
  std::cout << server->id() << " SUCCESS" << std::endl;
  return 0;
}
