// Local private includes
#include "ZeroMQCommunicatorSecure.hpp"
#include "ProtoBufFactory.hpp"
#include "support/zeromq/Context.hpp"
#include "support/zeromq/SocketTranslator.hpp"

// Local public includes
#include "common/IMessage.hpp"
#include "common/ISocket.hpp"
#include "common/SocketFactory.hpp"
#include "common/SocketOptions.hpp"

// Third party includes
#include <boost/range/adaptor/reversed.hpp>
#include <zmq.hpp>

// Standard includes
#include <arpa/inet.h>
#include <string>
#include <unordered_map>

using namespace zmq;
namespace proto = ::google::protobuf;

namespace SDMS {

using namespace constants::message::google;

void ZeroMQCommunicatorSecure::zmqCurveSetup(const ICredentials &credentials) {

  int rc;

  // SERVER only needs private key
  if (m_socket->getSocketClassType() == SocketClassType::SERVER) {

    int curve_server = 1;

    if ((rc = zmq_setsockopt(m_zmq_socket, ZMQ_CURVE_SERVER, &curve_server,
                             sizeof(curve_server))) == -1) {
      EXCEPT_PARAM(1, "Set ZMQ_CURVE_SERVER failed when constructing ZeroMQ "
                      "Server. ZMQ msg: "
                          << zmq_strerror(zmq_errno()));
    }

    if (not credentials.has(CredentialType::PRIVATE_KEY)) {
      EXCEPT_PARAM(
          1, "Unable to setup ZeroMQ Server Communicator missing private key.");
    }
    std::string local_priv_key = credentials.get(CredentialType::PRIVATE_KEY);

    uint8_t private_key[32];
    if (!zmq_z85_decode(private_key, local_priv_key.c_str())) {
      EXCEPT_PARAM(
          1,
          "Decode private key failed when constructing ZeroMQ Server. ZMQ msg: "
              << zmq_strerror(zmq_errno()));
    }

    // This is the servers private key
    if ((rc = zmq_setsockopt(m_zmq_socket, ZMQ_CURVE_SECRETKEY, private_key,
                             32)) == -1) {
      EXCEPT_PARAM(1, "Set ZMQ_CURVE_SECRETKEY failed when constructing ZeroMQ "
                      "Server. ZMQ msg: "
                          << zmq_strerror(zmq_errno()));
    }

  } else if (m_socket->getSocketClassType() == SocketClassType::CLIENT) {
    // CLIENT needs the servers public key and its public key
    if (not credentials.has(CredentialType::PRIVATE_KEY)) {
      EXCEPT_PARAM(
          1, "Unable to setup ZeroMQ Client Communicator missing private key.");
    }
    if (not credentials.has(CredentialType::PUBLIC_KEY)) {
      EXCEPT_PARAM(
          1, "Unable to setup ZeroMQ Client Communicator missing public key.");
    }
    if (not credentials.has(CredentialType::SERVER_KEY)) {
      EXCEPT_PARAM(
          1, "Unable to setup ZeroMQ Client Communicator missing server key.");
    }
    std::string local_priv_key = credentials.get(CredentialType::PRIVATE_KEY);
    std::string local_pub_key = credentials.get(CredentialType::PUBLIC_KEY);
    std::string local_serv_key = credentials.get(CredentialType::SERVER_KEY);

    uint8_t private_key[32];
    if (!zmq_z85_decode(private_key, local_priv_key.c_str())) {
      EXCEPT_PARAM(
          1,
          "Decode private key failed when constructing ZeroMQ Client. ZMQ msg: "
              << zmq_strerror(zmq_errno()));
    }

    uint8_t public_key[32];
    if (!zmq_z85_decode(public_key, local_pub_key.c_str())) {
      EXCEPT_PARAM(
          1,
          "Decode public key failed when constructing ZeroMQ Client. ZMQ msg: "
              << zmq_strerror(zmq_errno()));
    }

    uint8_t server_key[32];
    if (!zmq_z85_decode(server_key, local_serv_key.c_str())) {
      EXCEPT_PARAM(1, "Decode server public key failed when constructing "
                      "ZeroMQ Client. ZMQ msg: "
                          << zmq_strerror(zmq_errno()));
    }

    // This is the clients private key
    if ((rc = zmq_setsockopt(m_zmq_socket, ZMQ_CURVE_SECRETKEY, private_key,
                             32)) == -1) {
      EXCEPT_PARAM(1, "Set ZMQ_CURVE_PUBLICKEY failed when constructing ZeroMQ "
                      "Client. ZMQ msg: "
                          << zmq_strerror(zmq_errno()));
    }

    // This is the clients public key
    if ((rc = zmq_setsockopt(m_zmq_socket, ZMQ_CURVE_PUBLICKEY, public_key,
                             32)) == -1) {
      EXCEPT_PARAM(1, "Set ZMQ_CURVE_PUBLICKEY failed when constructing ZeroMQ "
                      "Client. ZMQ msg: "
                          << zmq_strerror(zmq_errno()));
    }

    // This is the servers public key
    if ((rc = zmq_setsockopt(m_zmq_socket, ZMQ_CURVE_SERVERKEY, server_key,
                             32)) == -1) {
      EXCEPT_PARAM(1, "Set ZMQ_CURVE_PUBLICKEY failed when constructing ZeroMQ "
                      "Client. ZMQ msg: "
                          << zmq_strerror(zmq_errno()));
    }
  }
}

/******************************************************************************
 * Public Class Methods
 ******************************************************************************/
ZeroMQCommunicatorSecure::ZeroMQCommunicatorSecure(
    const SocketOptions &socket_options, const ICredentials &credentials,
    uint32_t timeout_on_receive_milliseconds, long timeout_on_poll_milliseconds,
    LogContext log_context)
    : ZeroMQCommunicator(log_context) {

  if (not zmq_has("curve")) {
    EXCEPT(1, "ZeroMQ was not built with curve support cannot create secure "
              "connections.");
  }
  m_timeout_on_receive_milliseconds = timeout_on_receive_milliseconds;
  m_timeout_on_poll_milliseconds = timeout_on_poll_milliseconds;

  auto socket_factory = SocketFactory();
  m_socket = socket_factory.create(socket_options, credentials);

  // If running INPROC, each ZeroMQ socket should use the same context, other
  // wise they should a different context.
  if ( socket_options.scheme == URIScheme::INPROC ) {
    m_zmq_ctx = InprocContext::getContext();
    InprocContext::increment();
  } else {
    m_zmq_ctx = zmq_ctx_new();
  }

  m_zmq_socket_type = translateToZMQSocket(m_socket.get());
  m_zmq_socket = zmq_socket(m_zmq_ctx, m_zmq_socket_type);

  if (m_zmq_socket == nullptr) {
      int err = zmq_errno();
      std::string error_message = zmq_strerror(err);
      EXCEPT_PARAM(1, "Error creating ZeroMQ socket (type: "
                << zmqSocketTypeToString(m_zmq_socket_type)
                << "): [" << err << "] " << error_message);
  }

  // Order matters must occur after m_zmq_socket has been created
  zmqCurveSetup(credentials);
  // -1 - Leave to OS
  // Not sure what 0 and 1 do other than mean you are going to overide
  // the defaults
  const int keep_alive = 1;
  const int keep_alive_cnt = 20;
  const int keep_alive_idle = 540;
  const int keep_alive_intvl = 5;
  const int reconnect_ivl = 500;
  const int reconnect_ivl_max = 4000;
  const int linger_milliseconds = 100;

  zmq_setsockopt(m_zmq_socket, ZMQ_TCP_KEEPALIVE, &keep_alive,
                 sizeof(const int));
  zmq_setsockopt(m_zmq_socket, ZMQ_TCP_KEEPALIVE_CNT, &keep_alive_cnt,
                 sizeof(const int));
  zmq_setsockopt(m_zmq_socket, ZMQ_TCP_KEEPALIVE_IDLE, &keep_alive_idle,
                 sizeof(const int));
  zmq_setsockopt(m_zmq_socket, ZMQ_TCP_KEEPALIVE_INTVL, &keep_alive_intvl,
                 sizeof(const int));
  zmq_setsockopt(m_zmq_socket, ZMQ_RECONNECT_IVL, &reconnect_ivl,
                 sizeof(const int));
  zmq_setsockopt(m_zmq_socket, ZMQ_RECONNECT_IVL_MAX, &reconnect_ivl_max,
                 sizeof(const int));
  zmq_setsockopt(m_zmq_socket, ZMQ_LINGER, &linger_milliseconds,
                 sizeof(const int));

  std::string id = m_socket->getID();

  if (id.size() > constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE) {
    EXCEPT_PARAM(
        1, "ZeroMQ exceeds max number of characters allowed, allowed: "
               << constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE
               << " number provided " << id.size() << " identity: " << id);
  }

  zmq_setsockopt(m_zmq_socket, ZMQ_IDENTITY, id.c_str(), id.size());

  if (m_socket->getSocketConnectionLife() == SocketConnectionLife::PERSISTENT) {
    bool failure = zmq_bind(m_zmq_socket, m_socket->getAddress().c_str()) != 0;
    if (failure) {
      EXCEPT_PARAM(1, "ZeroMQ bind to address '" << m_socket->getAddress()
                                                 << "' failed. zmq error msg: "
                                                 << zmq_strerror(zmq_errno()));
    }
  } else {
    bool failure =
        zmq_connect(m_zmq_socket, m_socket->getAddress().c_str()) != 0;
    if (failure) {
      EXCEPT_PARAM(1, "ZeroMQ connect to address '"
                          << m_socket->getAddress()
                          << "' failed. zmq error msg: "
                          << zmq_strerror(zmq_errno()));
    }
  }
  if (m_zmq_socket_type == ZMQ_SUB) {
    bool failure = zmq_setsockopt(m_zmq_socket, ZMQ_SUBSCRIBE, "", 0) != 0;
    if (failure) {
      EXCEPT_PARAM(1, "ZeroMQ connect to address '" << m_socket->getAddress()
                                                    << "' failed.");
    }
  }
}

} // namespace SDMS
