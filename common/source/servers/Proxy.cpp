
// Local private includes
#include "Proxy.hpp"

// Local public includes
#include "common/CommunicatorFactory.hpp"
#include "common/ICommunicator.hpp"
#include "common/TraceException.hpp"

// Proto file includes
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"

// Standard includes
#include <exception>
#include <iostream>
#include <unordered_map>

using namespace std;

namespace SDMS {

Proxy::Proxy(
    const std::unordered_map<SocketRole, SocketOptions> &socket_options,
    const std::unordered_map<SocketRole, ICredentials *> &socket_credentials,
    LogContext log_context)
    : Proxy(socket_options, socket_credentials,
            std::vector<std::unique_ptr<IOperator>>(), log_context){};

Proxy::Proxy(
    const std::unordered_map<SocketRole, SocketOptions> &socket_options,
    const std::unordered_map<SocketRole, ICredentials *> &socket_credentials,
    std::vector<std::unique_ptr<IOperator>> incoming_operators,
    LogContext log_context)
    : m_incoming_operators(std::move(incoming_operators)),
      m_log_context(log_context) {

  if (socket_options.count(SocketRole::CLIENT) == 0) {
    EXCEPT(1, "Proxy must have socket options for Client");
  }
  if (socket_credentials.count(SocketRole::CLIENT) == 0) {
    EXCEPT(1, "Proxy must have socket credentials for Client");
  }

  if (socket_options.count(SocketRole::SERVER) == 0) {
    EXCEPT(1, "Proxy must have socket options for SERVER");
  }
  if (socket_credentials.count(SocketRole::SERVER) == 0) {
    EXCEPT(1, "Proxy must have socket credentials for SERVER");
  }

  if (socket_options.at(SocketRole::CLIENT).connection_life ==
      SocketConnectionLife::INTERMITTENT) {
    if (socket_options.at(SocketRole::CLIENT).class_type !=
        SocketClassType::CLIENT) {
      EXCEPT_PARAM(1, "Custom proxy does not yet support intermittent "
                      "connections for any socket class but client.");
    }
  }

  CommunicatorFactory communication_factory(m_log_context);

  // WARNING: Do not reorder the communication creation order, the server and a call to bind
  // when using INPROC must occur before a client connect call can be
  // made.
  //
  // https://zguide.zeromq.org/docs/chapter2/
  //
  // > The inter-thread transport, inproc, is a connected signaling transport.
  // > It is much faster than tcp or ipc. This transport has a specific
  // > limitation compared to tcp and ipc: the server must issue a bind before
  // > any client issues a connect. This was fixed in ZeroMQ v4.0 and later
  // > versions.
  m_communicators[SocketRole::SERVER] = communication_factory.create(
      socket_options.at(SocketRole::SERVER),
      *socket_credentials.at(SocketRole::SERVER),
      m_timeout_on_receive_milliseconds, m_timeout_on_poll_milliseconds);

  m_communicators[SocketRole::CLIENT] = communication_factory.create(
      socket_options.at(SocketRole::CLIENT),
      *socket_credentials.at(SocketRole::CLIENT),
      m_timeout_on_receive_milliseconds, m_timeout_on_poll_milliseconds);

  m_addresses[SocketRole::CLIENT] =
      m_communicators[SocketRole::CLIENT]->address();
  m_addresses[SocketRole::SERVER] =
      m_communicators[SocketRole::SERVER]->address();
}

void Proxy::setRunDuration(std::chrono::duration<double> duration) {
  m_run_infinite_loop = false;
  m_run_duration = duration;
}

void Proxy::run() {

  auto end_time = std::chrono::steady_clock::now() + m_run_duration;

  int count = 0;

  while (m_run_infinite_loop or (end_time > std::chrono::steady_clock::now())) {
    try {
      count++;
      // Coming from the client socket that is local so communication flow is
      // going from an internal thread/process
      //
      //                                              <- POLL_IN
      // Pub Client - Client Sock - Serv Sock - Proxy - Client Sock - Serv Sock
      // - Inter App
      auto resp_from_client_socket = m_communicators[SocketRole::CLIENT]->poll(
          MessageType::GOOGLE_PROTOCOL_BUFFER);

      if (resp_from_client_socket.error) {
        DL_ERROR(m_log_context, m_communicators[SocketRole::CLIENT]->id()
                                    << " error detected: "
                                    << resp_from_client_socket.error_msg);
      }

      // Coming from the server socket that is local so communication flow is
      // coming from a public client thread/process
      //
      //                              POLL_IN  ->
      // Pub Client - Client Sock - Serv Sock - Proxy - Client Sock - Serv Sock
      // - Inter App
      auto resp_from_server_socket = m_communicators[SocketRole::SERVER]->poll(
          MessageType::GOOGLE_PROTOCOL_BUFFER);
      if (resp_from_server_socket.error) {
        DL_ERROR(m_log_context, m_communicators[SocketRole::SERVER]->id()
                                    << " error detected: "
                                    << resp_from_server_socket.error_msg);
      }

      // Essentially just route with out doing anything if flow is towards the
      // public
      if (resp_from_client_socket.error == false and
          resp_from_client_socket.time_out == false) {
        if (not resp_from_client_socket.message) {
          DL_ERROR(
              m_log_context,
              "Proxy::run - Something is wrong, message "
                  << "response is not defined but no timeouts or errors were "
                  << "triggered, unable to send to server.");
        } else {
          m_communicators[SocketRole::SERVER]->send(
              *resp_from_client_socket.message);
        }
      }

      // If there are operations that need to happen on incoming messages,
      // messages headed to the internal server of which we are a client,
      // they will now be executed.
      //                 |            |
      //         POLL_IN ->           |
      //                 | Operate on -> Pass to internal Server
      //                 |            |
      // ... - Serv Sock - Proxy ------ Client Sock - Serv Sock - Inter App
      if (resp_from_server_socket.error == false and
          resp_from_server_socket.time_out == false) {
        if (not resp_from_server_socket.message) {
          DL_ERROR(
              m_log_context,
              "Proxy::run - Something is wrong, message "
                  << "response is not defined but no timeouts or errors were "
                  << "triggered, unable to operate and send to client.");
        } else {
          for (auto &in_operator : m_incoming_operators) {
            in_operator->execute(*resp_from_server_socket.message);
          }
          m_communicators[SocketRole::CLIENT]->send(
              *resp_from_server_socket.message);
        }
      }

    } catch (TraceException &e) {
      DL_ERROR(m_log_context, "Proxy::run - " << e.toString());
    } catch (exception &e) {
      DL_ERROR(m_log_context, "Proxy::run - " << e.what());
    } catch (...) {
      DL_ERROR(m_log_context, "Proxy::run - unknown exception");
    }
  } // while( m_run_infinite ...etc)
  DL_INFO(m_log_context,
          "Proxy is gracefully exiting after specified timeout.");
} // run()

} // namespace SDMS
