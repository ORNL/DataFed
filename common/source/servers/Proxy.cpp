
// Local includes
#include "ICommunicator.hpp"
#include "Proxy.hpp"
#include "TraceException.hpp"
#include "CommunicatorFactory.hpp"

// Proto file includes
#include <SDMS_Anon.pb.h>
#include <SDMS_Auth.pb.h>

// Standard includes
#include <exception>
#include <iostream>
#include <unordered_map>

using namespace std;

namespace SDMS {

  Proxy::Proxy(
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials *> & socket_credentials) :
    Proxy(
        socket_options,
        socket_credentials,
        std::vector<std::unique_ptr<IOperator>>()) {};

  Proxy::Proxy(
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials*> & socket_credentials,
      std::vector<std::unique_ptr<IOperator>> incoming_operators) :
    m_incoming_operators(std::move(incoming_operators)) {

      if( socket_options.count(SocketRole::CLIENT) == 0 ) {
        EXCEPT(1, "Proxy must have socket options for Client"); 
      }
      if ( socket_credentials.count(SocketRole::CLIENT) == 0 ) {
        EXCEPT(1, "Proxy must have socket credentials for Client"); 
      }

      if( socket_options.count(SocketRole::SERVER) == 0 ) {
        EXCEPT(1, "Proxy must have socket options for SERVER"); 
      }
      if ( socket_credentials.count(SocketRole::SERVER) == 0 ) {
        EXCEPT(1, "Proxy must have socket credentials for SERVER"); 
      }

      if( socket_options.at(SocketRole::CLIENT).connection_life == SocketConnectionLife::INTERMITTENT ){
        if( socket_options.at(SocketRole::CLIENT).class_type != SocketClassType::CLIENT ) {
          EXCEPT_PARAM( 1, "Custom proxy does not yet support intermittent connections for any socket class but client." );
        }
      }

      CommunicatorFactory communication_factory;

      //std::cout << "Creating proxy CLIENT" << std::endl;
      m_communicators[SocketRole::CLIENT] = communication_factory.create(
          socket_options.at(SocketRole::CLIENT),
          *socket_credentials.at(SocketRole::CLIENT),
          m_timeout_on_receive_milliseconds,
          m_timeout_on_poll_milliseconds);
      
      //std::cout << "Creating proxy SERVER" << std::endl;
      m_communicators[SocketRole::SERVER] = communication_factory.create(
          socket_options.at(SocketRole::SERVER),
          *socket_credentials.at(SocketRole::SERVER),
          m_timeout_on_receive_milliseconds,
          m_timeout_on_poll_milliseconds);

      m_addresses[SocketRole::CLIENT] = m_communicators[SocketRole::CLIENT]->address();
      m_addresses[SocketRole::SERVER] = m_communicators[SocketRole::SERVER]->address();
    }


  void Proxy::setRunDuration(std::chrono::duration<double> duration) {
    m_run_infinite_loop = false;
    m_run_duration = duration;
  }

  void Proxy::run() {

    auto end_time = std::chrono::steady_clock::now() + m_run_duration;

    int count = 0;

    while ( m_run_infinite_loop or (end_time > std::chrono::steady_clock::now()) ) { 
      try {
        count++;
        // Coming from the client socket that is local so communication flow is
        // going from an internal thread/process
        // 
        //                                              <- POLL_IN
        // Pub Client - Client Sock - Serv Sock - Proxy - Client Sock - Serv Sock - Inter App
        //std::cout << m_communicators[SocketRole::CLIENT]->id() << " poll" << std::endl;
        auto resp_from_client_socket = m_communicators[SocketRole::CLIENT]->poll(MessageType::GOOGLE_PROTOCOL_BUFFER);

        if(resp_from_client_socket.error){
          std::cout << m_communicators[SocketRole::CLIENT]->id() << " error detected: " << resp_from_client_socket.error_msg << std::endl;
        }
        //std::cout << "Done proxy polling for messages from server" << std::endl;
        
        if( count > 100 ) {
          std::cout << "Proxy running..." << std::endl;
          std::cout << "Client id is: " << m_communicators[SocketRole::CLIENT]->id() << " Client address is: " << m_communicators[SocketRole::CLIENT]->address() << std::endl;
          std::cout << "Server id is: " << m_communicators[SocketRole::SERVER]->id() << " Client address is: " << m_communicators[SocketRole::SERVER]->address() << std::endl;
          count = 0;
        }
        // Coming from the server socket that is local so communication flow is
        // coming from a public client thread/process
        // 
        //                              POLL_IN  -> 
        // Pub Client - Client Sock - Serv Sock - Proxy - Client Sock - Serv Sock - Inter App
        //std::cout << "Proxy polling for messages from  client" << std::endl;
        //std::cout << m_communicators[SocketRole::SERVER]->id() << " poll" << std::endl;
        auto resp_from_server_socket = m_communicators[SocketRole::SERVER]->poll(MessageType::GOOGLE_PROTOCOL_BUFFER);
        if(resp_from_server_socket.error){
          std::cout << m_communicators[SocketRole::SERVER]->id() << " error detected: " << resp_from_server_socket.error_msg << std::endl;
        }
        //std::cout << "Done proxy polling for messages from  client" << std::endl;

        // Essentially just route with out doing anything if flow is towards the
        // public
        if(resp_from_client_socket.error == false and resp_from_client_socket.time_out == false ){
          //std::cout << "Proxy sending messages via proxy from server to client" << std::endl;
          std::cout << m_communicators[SocketRole::SERVER]->id() << " send" << std::endl;
          m_communicators[SocketRole::SERVER]->send(*resp_from_client_socket.message);
        }

        // If there are operations that need to happen on incoming messages,
        // messages headed to the internal server of which we are a client,
        // they will now be executed.
        //                 |            |
        //         POLL_IN ->           |
        //                 | Operate on -> Pass to internal Server
        //                 |            |
        // ... - Serv Sock - Proxy ------ Client Sock - Serv Sock - Inter App
        //std::cout << "Proxy size of incoming operators: " << m_incoming_operators.size() << std::endl;
        if(resp_from_server_socket.error == false and resp_from_server_socket.time_out == false) {
          for( auto & in_operator : m_incoming_operators ) {
            //std::cout << "Proxy operating on messages from client" << std::endl;
            std::cout << m_communicators[SocketRole::SERVER]->id() << " running operators" << std::endl;
            in_operator->execute(*resp_from_server_socket.message);
          }

          //std::cout << "Proxy sending messages via proxy from client to server" << std::endl;
//          std::cout << "Frame size is " << resp_from_server_socket.message->get("frame_size") << std::endl;
 //         std::cout << "Frame proto_id is " << resp_from_server_socket.message->get("proto_id") << std::endl;
  //        std::cout << "Frame msg_id is " << resp_from_server_socket.message->get("msg_id") << std::endl;
          std::cout << m_communicators[SocketRole::CLIENT]->id() << " send" << std::endl;
          m_communicators[SocketRole::CLIENT]->send(*resp_from_server_socket.message);
        }

      } catch( TraceException & e ) {
        std::cerr << "Proxy::run - " << e.toString() << "\n";
      } catch( exception & e ) {
        std::cerr << "Proxy::run - " << e.what() << "\n";
      } catch( ... ) {
        std::cerr << "Proxy::run - unknown exception" << "\n";
      }
    } // while( m_run_infinite ...etc)
    std::cout << "Proxy is gracefully exiting after timeout." << std::endl;
  } // run()

} // namespace SDMS
