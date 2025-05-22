// Local private includes
#include "ProxyBasicZMQ.hpp"
#include "../support/zeromq/Context.hpp"
#include "../support/zeromq/SocketTranslator.hpp"

// Local public includes
#include "common/ICommunicator.hpp"
#include "common/IServer.hpp"
#include "common/SocketFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <chrono>
#include <iostream>
#include <memory>
#include <thread>
#include <unordered_map>

namespace SDMS {

std::string sanitize(std::string val, const std::string &pattern,
                     const std::string &replacement) {
  for (auto at = val.find(pattern, 0); at != std::string::npos;
       at = val.find(pattern, at + replacement.length())) {

    val.replace(at, pattern.length(), replacement);
  }
  return val;
}

/// Convenience constructor
ProxyBasicZMQ::ProxyBasicZMQ(
    const std::unordered_map<SocketRole, SocketOptions> &socket_options,
    const std::unordered_map<SocketRole, ICredentials *> &socket_credentials,
    LogContext log_context)
    : m_log_context(log_context) {

  if (socket_options.count(SocketRole::CLIENT) == 0) {
    EXCEPT(1, "ProxyBasicZMQ must have socket options for Client");
  }

  if (socket_options.count(SocketRole::SERVER) == 0) {
    EXCEPT(1, "ProxyBasicZMQ must have socket options for SERVER");
  }

  m_client_zmq_type =
      translateToZMQSocket(socket_options.at(SocketRole::CLIENT));
  if (m_client_zmq_type != ZMQ_DEALER) {
    EXCEPT_PARAM(1, "ProxyBasicZMQ frontend currently only supports DEALER "
                    "type, the type provided is: "
                        << zmqSocketTypeToString(m_client_zmq_type));
  }

  m_server_zmq_type =
      translateToZMQSocket(socket_options.at(SocketRole::SERVER));
  if (m_server_zmq_type != ZMQ_ROUTER) {
    EXCEPT_PARAM(1, "ProxyBasicZMQ backend currently only supports ROUTER "
                    "type, the type provided is: "
                        << zmqSocketTypeToString(m_server_zmq_type));
  }

  if (socket_options.at(SocketRole::SERVER).protocol_type !=
      ProtocolType::ZQTP) {
    EXCEPT(1, "ProxyBasicZMQ server currently only supports ZQTP protocol");
  }

  if (socket_options.at(SocketRole::CLIENT).protocol_type !=
      ProtocolType::ZQTP) {
    EXCEPT(1, "ProxyBasicZMQ client currently only supports ZQTP protocol");
  }

  if (socket_options.at(SocketRole::SERVER).scheme != URIScheme::INPROC and
      socket_options.at(SocketRole::SERVER).scheme != URIScheme::TCP) {
    EXCEPT(
        1,
        "ProxyBasicZMQ server currently only supports inproc and TCP scheme");
  }

  if (socket_options.at(SocketRole::CLIENT).scheme != URIScheme::INPROC) {
    EXCEPT(1, "ProxyBasicZMQ client currently only supports inproc scheme");
  }

  if (socket_options.at(SocketRole::SERVER).connection_life !=
      SocketConnectionLife::PERSISTENT) {
    EXCEPT(1, "ProxyBasicZMQ server currently only supports persistent "
              "connections for server socket");
  }
  if (socket_options.at(SocketRole::CLIENT).connection_life !=
      SocketConnectionLife::PERSISTENT) {
    EXCEPT(1, "ProxyBasicZMQ server currently only supports persistent "
              "connections for client socket");
  }

  if (socket_options.size() > 2) {
    EXCEPT(1, "ProxyBasicZMQ currently only supports CLIENT and SERVER roles.");
  }
  SocketFactory sock_factory;
  m_client_socket =
      sock_factory.create(socket_options.at(SocketRole::CLIENT),
                          *socket_credentials.at(SocketRole::CLIENT));
  m_server_socket =
      sock_factory.create(socket_options.at(SocketRole::SERVER),
                          *socket_credentials.at(SocketRole::SERVER));

  m_addresses[SocketRole::CLIENT] = m_client_socket->getAddress();
  m_addresses[SocketRole::SERVER] = m_server_socket->getAddress();

  m_client_host = socket_options.at(SocketRole::CLIENT).host;
  m_server_host = socket_options.at(SocketRole::SERVER).host;
  if (m_debug_output) {
    m_addresses[SocketRole::MONITOR] = "inproc://monitor_";
    m_addresses[SocketRole::MONITOR] +=
        sanitize(m_client_host, "*", "all") + "_";
    m_addresses[SocketRole::MONITOR] += sanitize(m_server_host, "*", "all");
  }
}

/**
 * By default will run forever you can specify a time to run the for instead
 *
 * std::chrono::duration<double> duration = std::chrono::seconds(1);
 * setRunDuration(duration)
 **/
void ProxyBasicZMQ::setRunDuration(std::chrono::duration<double> duration) {
  m_run_duration = duration;
  m_run_infinite_loop = false;

  m_addresses[SocketRole::CONTROL] = "inproc://control_";

  /*
   * Replace '*' with 'all'
   */
  m_addresses[SocketRole::CONTROL] += sanitize(m_client_host, "*", "all") + "_";
  m_addresses[SocketRole::CONTROL] += sanitize(m_server_host, "*", "all");
}

void ProxyBasicZMQ::run() {

  void *ctx = getContext();

  /**
   * WARNING: Best practice is to bind sockets before creating connections
   * Specifically for INPROC channels.
   *
   * https://zguide.zeromq.org/docs/chapter2/
   *
   * > The inter-thread transport, inproc, is a connected signaling transport.
   * > It is much faster than tcp or ipc. This transport has a specific
   * > limitation compared to tcp and ipc: the server must issue a bind before
   * > any client issues a connect. This was fixed in ZeroMQ v4.0 and later
   * > versions.
   **/
  void *router_frontend_socket = zmq_socket(ctx, ZMQ_ROUTER);
  if (not router_frontend_socket) {
    EXCEPT(1, "Problem creating frontend ROUTER socket");
  }
  int router_linger = 100;
  zmq_setsockopt(router_frontend_socket, ZMQ_LINGER, &router_linger,
                 sizeof(int));
  /**
   * NOTE
   *
   * The socket on the proxy that will connect with the frontend is a
   * server socket. The proxy serves the frontend.
   **/
  DL_DEBUG(m_log_context,
           "Binding ROUTER to address: " << m_server_socket->getAddress());
  int rc =
      zmq_bind(router_frontend_socket, m_server_socket->getAddress().c_str());
  if (rc) {
    EXCEPT_PARAM(1, "Problem binding frontend ROUTER socket, address: "
                        << m_server_socket->getAddress()
                        << " zmq_error: " << zmq_strerror(zmq_errno()));
  }

  /**
   * Lambda is only needed if the proxy is not being run for an infinite
   * loop.
   **/
  auto terminate_call = [](std::chrono::duration<double> duration,
                           const std::string &address, int thread_id,
                           LogContext log_context) {
    log_context.thread_name += "-terminate_after_timeout";
    log_context.thread_id = thread_id;
    DL_INFO(log_context,
            "Launching control thread for duration: " << duration.count());
    void *context = getContext();
    auto control_local = zmq_socket(context, ZMQ_PUB);
    DL_INFO(log_context, "CONTROL: Sleeping");
    std::this_thread::sleep_for(duration);
    zmq_bind(control_local, address.c_str());
    DL_INFO(log_context, "CONTROL: TERMINATE");
    std::string command = "TERMINATE";
    zmq_send(control_local, command.c_str(), command.size(), 0);
    int rc_local = zmq_close(control_local);
    if (rc_local) {
      EXCEPT(1, "Problem closing control socket from PUBLISHING thread");
    }
  };

  std::thread control_thread;
  if (m_run_infinite_loop == false) {
    control_thread = std::thread(terminate_call, m_run_duration,
                                 m_addresses[SocketRole::CONTROL],
                                 m_thread_count, m_log_context);
    ++m_thread_count;
  }

  /**
   * Thread is for debugging purposes mostly, for logging the messages
   * that are sent through the steerable proxy.
   **/
  auto proxy_log_call = [](const std::string address, int thread_id,
                           LogContext log_context) {
    log_context.thread_name += "-capture_thread";
    log_context.thread_id = thread_id;
    void *context = getContext();
    auto capture_local = zmq_socket(context, ZMQ_SUB);
    zmq_bind(capture_local, address.c_str());
    zmq_setsockopt(capture_local, ZMQ_SUBSCRIBE, "", 0);
    zmq_pollitem_t items[] = {{capture_local, 0, ZMQ_POLLIN, 0}};
    const int num_items_in_array = 1;
    int events_detected = 0;
    uint32_t timeout_milliseconds = 50;
    DL_INFO(log_context, "CAPTURE: Starting thread");
    bool terminate = false;
    while (true) {
      events_detected =
          zmq_poll(items, num_items_in_array, timeout_milliseconds);
      if (events_detected > 0) {

        zmq_msg_t zmq_msg;
        zmq_msg_init(&zmq_msg);

        while (zmq_msg_more(&zmq_msg) or events_detected > 0) {
          // Reset events_detected
          events_detected = 0;
          int number_of_bytes = 0;
          if ((number_of_bytes =
                   zmq_msg_recv(&zmq_msg, capture_local, ZMQ_DONTWAIT)) < 0) {
            EXCEPT(1, "zmq_msg_recv (route) failed.");
          }

          // Stop when delimiter is read
          std::string new_msg((char *)zmq_msg_data(&zmq_msg),
                              zmq_msg_size(&zmq_msg));
          DL_TRACE(log_context, "CAPTURE: msg is = " << new_msg);
          if (new_msg.compare("TERMINATE") == 0) {
            DL_INFO(log_context, "CAPTURE: received TERMINATE message.");
            terminate = true;
          }
        }
        zmq_msg_close(&zmq_msg);
        if (terminate) {
          break;
        }
      }
    }

    int rc_local = zmq_close(capture_local);
    if (rc_local) {
      EXCEPT(1, "Problem closing capture socket from SUBSCRIBING thread");
    }
  };

  std::thread capture_thread;
  if (m_debug_output) {
    capture_thread =
        std::thread(proxy_log_call, m_addresses[SocketRole::MONITOR],
                    m_thread_count, m_log_context);
    ++m_thread_count;
  }

  // Backend socket talks to workers over inproc
  void *dealer_backend_socket = zmq_socket(ctx, ZMQ_DEALER);
  if (not dealer_backend_socket) {
    EXCEPT(1, "Problem creating backend DEALER socket");
  }
  int dealer_linger = 100;
  zmq_setsockopt(dealer_backend_socket, ZMQ_LINGER, &dealer_linger,
                 sizeof(int));
  /**
   * NOTE
   *
   * The socket on the proxy that will connect with the backend is a
   * client socket. The proxy acts like a client to the backend.
   **/
  DL_DEBUG(m_log_context, "Binding DEALER socket to address: "
                              << m_client_socket->getAddress());
  rc = zmq_bind(dealer_backend_socket, m_client_socket->getAddress().c_str());
  if (rc) {
    EXCEPT_PARAM(1, "Problem binding backend DEALER socket, address: "
                        << m_client_socket->getAddress());
  }

  /**
   * Control socket receives terminate command from main over inproc
   *
   * In the case that we need to exit early or run the proxy for a fixed
   * amount of time.
   *
   * WARNING the order matters the SUB only works for sockets bind and or
   * connects made to it after it has been created and connected
   **/
  void *control_socket = nullptr;
  if (m_run_infinite_loop == false) {
    control_socket = zmq_socket(ctx, ZMQ_SUB);
    if (not control_socket) {
      EXCEPT(1, "Problem creating control socket");
    }
    int rc = zmq_setsockopt(control_socket, ZMQ_SUBSCRIBE, "", 0);
    if (rc) {
      EXCEPT(1, "Problem subscribing control socket");
    }
    rc = zmq_connect(control_socket, m_addresses[SocketRole::CONTROL].c_str());
    if (rc) {
      EXCEPT(1, "Problem connecting control socket");
    }
    int linger = 100;
    zmq_setsockopt(control_socket, ZMQ_LINGER, &linger, sizeof(linger));
  }

  void *capture_socket = nullptr;
  if (m_debug_output) {
    capture_socket = zmq_socket(ctx, ZMQ_PUB);
    if (not capture_socket) {
      EXCEPT(1, "Problem creating capture socket");
    }
    int rc =
        zmq_connect(capture_socket, m_addresses[SocketRole::MONITOR].c_str());
    if (rc) {
      EXCEPT(1, "Problem connecting capture socket");
    }
    int linger = 100;
    zmq_setsockopt(capture_socket, ZMQ_LINGER, &linger, sizeof(linger));
  }

  // Connect backend to frontend via a proxy
  zmq_proxy_steerable(router_frontend_socket, dealer_backend_socket,
                      capture_socket, control_socket);

  // Give the threads a chance to finish what they are doing
  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  if (m_debug_output) {
    capture_thread.join();
  }
  if (m_run_infinite_loop == false) {
    control_thread.join();
  }

  rc = zmq_close(router_frontend_socket);
  if (rc) {
    EXCEPT(1, "Problem closing frontend router socket");
  }
  rc = zmq_close(dealer_backend_socket);
  if (rc) {
    EXCEPT(1, "Problem closing backend router socket");
  }
  if (m_debug_output) {
    rc = zmq_close(capture_socket);
    if (rc) {
      EXCEPT(1, "Problem closing capture socket");
    }
  }

  if (m_run_infinite_loop == false) {
    rc = zmq_close(control_socket);
    if (rc) {
      EXCEPT(1, "Problem closing control socket");
    }
  }
}

} // namespace SDMS
