// Local private includes
#include "ZeroMQCommunicator.hpp"
#include "../Frame.hpp"
#include "../ProtoBufFactory.hpp"
#include "../support/zeromq/Context.hpp"
#include "../support/zeromq/SocketTranslator.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/IMessage.hpp"
#include "common/ISocket.hpp"
#include "common/ProtoBufMap.hpp"
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

/******************************************************************************
 * Local File Scoped Functions
 ******************************************************************************/
namespace {

void sendDelimiter(void *outgoing_zmq_socket) {
  // Send NULL delimiter
  zmq_msg_t zmq_msg;
  zmq_msg_init(&zmq_msg);
  int number_of_bytes = zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);

  zmq_msg_close(&zmq_msg);
  if(number_of_bytes < 0) {
    EXCEPT(1, "zmq_msg_send (delimiter) failed.");
  }
}

void sendFinalDelimiter(void *outgoing_zmq_socket) {
  // Send NULL delimiter
  zmq_msg_t zmq_msg;
  zmq_msg_init(&zmq_msg);
  int number_of_bytes = zmq_msg_send(&zmq_msg, outgoing_zmq_socket, 0);

  zmq_msg_close(&zmq_msg);
  if( number_of_bytes < 0 ) {
    EXCEPT(1, "zmq_msg_send (delimiter) failed.");
  }
}

/**
 * The only time we can expect an additional prefixed message is if the
 * server is of the ROUTER type.
 **/
// null
// "BEGIN DATAFED" - String
// 0 - number of routes
// null
// Frame starts here - function will not read
//
// If there was a route
//
// null
// "BEGIN DATAFED" - String
// 1 - number of routes
// Route 1
// null
// Frame - function will not read
//
// Or
//
// null
// "BEGIN DATAFED" - String
// 2 - number of routes
// Route 1
// Route 2
// null
// Frame - function will not read
//
// Or
//
// Route 1
// null
// "BEGIN DATAFED" - String
// - number of routes
// Route 2
// Route 3
// null
// Frame - function will not read
//
// Or
//
// Route 1
// null
// "BEGIN DATAFED" - String
// 0 - number of routes
// null
// Frame - function will not read
void receiveRoute(IMessage &msg, void *incoming_zmq_socket,
                  LogContext log_context) {
  // If the first frame is not empty assume it is a route that was provided by
  // the internals of zmq
  std::string previous_route = "";
  std::string received_part = "";
  while (received_part.compare("BEGIN_DATAFED") != 0) {
    zmq_msg_t zmq_msg;
    zmq_msg_init(&zmq_msg);
    int number_of_bytes = 0;
    if ((number_of_bytes =
             zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "receiveRoute zmq_msg_recv (route) failed.");
    }
    size_t len = zmq_msg_size(&zmq_msg);
    if (len) {
      if (len > 255) {
        zmq_msg_close(&zmq_msg);
        EXCEPT(1, "Message route segment exceeds max allowed length.");
      }
      received_part =
          std::string((char *)zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
      if (received_part.compare("BEGIN_DATAFED") == 0) {
        zmq_msg_close(&zmq_msg);
        break;
      } else {
        previous_route = received_part;
        msg.addRoute(received_part);
      }
    } else {
    }
    zmq_msg_close(&zmq_msg);
  }

  uint32_t number_of_routes = 0;
  {
    zmq_msg_t zmq_msg;
    zmq_msg_init(&zmq_msg);
    int number_of_bytes = 0;
    if ((number_of_bytes =
             zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "receiveRoute zmq_msg_recv (route) failed.");
    }
    size_t len = zmq_msg_size(&zmq_msg);

    if (len != sizeof(uint32_t)) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "Expected a number indicating the number of routes to follow "
                "but nothing was provided.");
    }

    unsigned char *msg_router_count_allocation =
        (unsigned char *)zmq_msg_data(&zmq_msg);
    number_of_routes = ntohl(*((uint32_t *)msg_router_count_allocation));
    DL_TRACE(log_context, "Number of Routes Detected: " << number_of_routes);
    zmq_msg_close(&zmq_msg);
  }
  // Start a while loop for the number of routes that have been indicated
  for (uint32_t route_i = 0; route_i < number_of_routes; ++route_i) {
    zmq_msg_t zmq_msg;
    zmq_msg_init(&zmq_msg);

    int number_of_bytes = 0;
    if ((number_of_bytes =
             zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "receiveRoute zmq_msg_recv (route) failed.");
    }
    size_t len = zmq_msg_size(&zmq_msg);

    // Stop when delimiter is read
    if (len == 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "Message route should not be an empty message.");
    }

    if (len > 255) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "Message route segment exceeds max allowed length.");
    }

    std::string new_route((char *)zmq_msg_data(&zmq_msg),
                          zmq_msg_size(&zmq_msg));
    // Only add the next route if it has a different name
    if (previous_route.compare(new_route) != 0) {
      msg.addRoute(new_route);
      previous_route = new_route;
    }
    zmq_msg_close(&zmq_msg);
  }

  // Finally read the final empty frame
  {
    zmq_msg_t zmq_msg;
    zmq_msg_init(&zmq_msg);
    int number_of_bytes = 0;
    if ((number_of_bytes =
             zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "receiveRoute zmq_msg_recv (route) failed.");
    }
    size_t len = zmq_msg_size(&zmq_msg);
    if (len != 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "Expected a null frame following route section.");
    }
    zmq_msg_close(&zmq_msg);
  }
}

void sendRoute(IMessage &msg, void *outgoing_zmq_socket,
               const int zmq_socket_type) {

  // If this is a response then we need to attach the identity of the server
  // that the response needs to be sent to
  auto routes = msg.getRoutes();

  // The ZMQ ROUTER always needs to know who to send too.
  if (std::get<MessageState>(msg.get(MessageAttribute::STATE)) ==
          MessageState::RESPONSE or
      zmq_socket_type == ZMQ_ROUTER) {
    while (routes.size() != 0) {

      auto route = routes.front();
      zmq_msg_t zmq_msg;
      zmq_msg_init_size(&zmq_msg, route.size());

      memcpy(zmq_msg_data(&zmq_msg), route.data(), route.size());
      int number_of_bytes =
               zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);

      zmq_msg_close(&zmq_msg);

      if ( number_of_bytes < 0 ) {
        EXCEPT(1, "sendRoute zmq_msg_send (route) failed.");
      }
      routes.pop_front();
    }
  }

  sendDelimiter(outgoing_zmq_socket);
  { // Send header
    zmq_msg_t zmq_msg;
    std::string header = "BEGIN_DATAFED";
    zmq_msg_init_size(&zmq_msg, header.size());
    memcpy(zmq_msg_data(&zmq_msg), header.data(), header.size());
    int number_of_bytes =
             zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);
    zmq_msg_close(&zmq_msg);
    if ( number_of_bytes < 0 ) {
      EXCEPT(1, "sendRoute count zmq_msg_send (route) failed.");
    }
  }

  { // Send number of routes
    uint32_t number_of_routes = routes.size();
    zmq_msg_t zmq_msg;
    zmq_msg_init_size(&zmq_msg, sizeof(uint32_t));
    unsigned char *msg_route_count_allocation =
        (unsigned char *)zmq_msg_data(&zmq_msg);
    *((uint32_t *)msg_route_count_allocation) = htonl(number_of_routes);

    int number_of_bytes =
             zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);
    zmq_msg_close(&zmq_msg);
    if ( number_of_bytes < 0 ) {
      EXCEPT(1, "sendRoute count zmq_msg_send (route) failed.");
    }
  }

  for (auto &route : routes) {
    if (route.size() == 0) {
      EXCEPT(1, "sendRoute zmq_msg_send (route) failed. Cannot send a route of "
                "size 0");
    }

    zmq_msg_t zmq_msg;
    zmq_msg_init_size(&zmq_msg, route.size());

    memcpy(zmq_msg_data(&zmq_msg), route.data(), route.size());
    int number_of_bytes = 
             zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);
    zmq_msg_close(&zmq_msg);
    if ( number_of_bytes < 0 ) {
      EXCEPT(1, "sendRoute zmq_msg_send (route) failed.");
    }
  }

  sendDelimiter(outgoing_zmq_socket);
}

/**
 * Will load the frame of the message.
 **/
void receiveFrame(IMessage &msg, void *incoming_zmq_socket,
                  LogContext log_context) {
  int number_of_bytes = 0;
  while (number_of_bytes == 0) {
    zmq_msg_t zmq_msg;
    zmq_msg_init_size(&zmq_msg, 8);
    if ((number_of_bytes =
             zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT_PARAM(
          1, "RCV zmq_msg_recv (frame) failed: " << zmq_strerror(zmq_errno()));
    } else if (number_of_bytes == 8) {
      FrameFactory frame_factory;
      Frame frame = frame_factory.create(zmq_msg); // THIS IS THE ERROR
      FrameConverter converter;
      converter.copy(FrameConverter::CopyDirection::FROM_FRAME, msg, frame);
      zmq_msg_close(&zmq_msg);
      DL_TRACE(log_context, "Received frame.");
      // Break out of loop after reading in frame
      break;
    } else if (zmq_msg_more(&zmq_msg) == 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "Multipart message is malformed, no frame was attached");
      break;
    } else {
      zmq_msg_close(&zmq_msg);
    }
    // Skip any leading 0s and contiue
  }
}

void sendFrame(IMessage &msg, void *outgoing_zmq_socket) {
  zmq_msg_t zmq_msg;
  zmq_msg_init_size(&zmq_msg, 8);
  // WARNING do not call zmq_msg_init it is called in copy method
  // this is a code smell and should be fixed in the future
  FrameFactory factory;
  Frame frame = factory.create(msg);
  FrameConverter converter;
  // Will call zmq_msg_init and create space for 8 bytes
  // Convert host binary to network (endian) format
  converter.copy(FrameConverter::CopyDirection::FROM_FRAME, zmq_msg, frame);

  int number_of_bytes =
           zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);
  zmq_msg_close(&zmq_msg);
  if ( number_of_bytes < 0 ) {
    EXCEPT(1, "zmq_msg_send (frame) failed.");
  }
}

/**
 * Will load the body of the message if there is one. Or else it will do
 * nothing.
 **/
void receiveBody(IMessage &msg, Buffer &buffer, ProtoBufFactory &factory,
                 void *incoming_zmq_socket, LogContext log_context) {

  if (msg.exists(FRAME_SIZE)) {
    uint32_t frame_size = std::get<uint32_t>(msg.get(FRAME_SIZE));

    zmq_msg_t zmq_msg;
    zmq_msg_init(&zmq_msg);

    int number_of_bytes = 0;
    if ((number_of_bytes =
             zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
      zmq_msg_close(&zmq_msg);
      EXCEPT_PARAM(1, "RCV zmq_msg_recv (body) failed. Frame size: "
                          << frame_size << " received " << number_of_bytes);
    }

    // Only set payload if there is a payload
    if (frame_size > 0) {

      if (zmq_msg_size(&zmq_msg) != frame_size) {
        zmq_msg_close(&zmq_msg);
        EXCEPT_PARAM(1, "RCV Invalid message body received. Expected: "
                            << frame_size
                            << ", got: " << zmq_msg_size(&zmq_msg));
      }

      copyToBuffer(buffer, zmq_msg_data(&zmq_msg), frame_size);
      uint16_t desc_type = std::get<uint16_t>(msg.get(MSG_TYPE));
      std::unique_ptr<proto::Message> payload = factory.create(desc_type);
      if (payload == nullptr) {
        zmq_msg_close(&zmq_msg);
        EXCEPT(1, "No payload was assigned something is wrong");
      }
      copyFromBuffer(payload.get(), buffer);
      msg.setPayload(std::move(payload));
    } else {

      // Even if the frame has 0 size it does not mean it is not a legitimate
      // message some messages have zero size but are still legitimate such
      // as a NACK
      uint16_t msg_type = std::get<uint16_t>(msg.get(MSG_TYPE));

      ProtoBufMap proto_map;
      DL_TRACE(log_context, "Receiving message body of type: " +
                                proto_map.toString(msg_type));
      if (proto_map.exists(msg_type)) {
        std::unique_ptr<proto::Message> payload = factory.create(msg_type);
        msg.setPayload(std::move(payload));
      } else {
        zmq_msg_close(&zmq_msg);
        EXCEPT(1, "Unrecognized message type specified unable to identify "
                  "message body/payload");
      }
    }

    if (zmq_msg_more(&zmq_msg)) {
      zmq_msg_close(&zmq_msg);
      EXCEPT(1, "There should not be additional messages after the body has "
                "been sent but there are...!");
    }
    zmq_msg_close(&zmq_msg);
  }
}

void sendBody(IMessage &msg, Buffer &buffer, void *outgoing_zmq_socket) {

  if (msg.exists(FRAME_SIZE)) {

    uint32_t frame_size = std::get<uint32_t>(msg.get(FRAME_SIZE));
    if (frame_size > 0) {
      zmq_msg_t zmq_msg;

      zmq_msg_init_size(&zmq_msg, frame_size);

      proto::Message *payload;
      try {
        payload = std::get<proto::Message *>(msg.getPayload());
      } catch (std::bad_variant_access const &ex) {
        EXCEPT(1, ex.what());
      }

      if (payload) {
        auto size = payload->ByteSizeLong();
        if (size != frame_size) {
          zmq_msg_close(&zmq_msg);
          EXCEPT_PARAM(1, "Frame and message sizes differ message size: "
                              << size << " frame size: " << frame_size);
        }

        copyToBuffer<proto::Message *>(buffer, payload, size);
        copyFromBuffer<void *>(zmq_msg_data(&zmq_msg), buffer);
        int number_of_bytes = 0;
        if ((number_of_bytes = zmq_msg_send(&zmq_msg, outgoing_zmq_socket, 0)) <
            0) {
          zmq_msg_close(&zmq_msg);
          EXCEPT(1, "zmq_msg_send (body) failed.");
        }
      } else {
        zmq_msg_close(&zmq_msg);
        EXCEPT(1, "Payload not defined... something went wrong");
      }

      zmq_msg_close(&zmq_msg);
    } else {

      sendFinalDelimiter(outgoing_zmq_socket);
    }
  } else {
    sendFinalDelimiter(outgoing_zmq_socket);
  }
}

void receiveCorrelationID(IMessage &msg, void *incoming_zmq_socket,
                          LogContext log_context) {
  // If the UID metadata is set, use is; otherwise get the UID from the message
  zmq_msg_t zmq_msg;
  zmq_msg_init(&zmq_msg);
  int number_of_bytes = 0;
  if ((number_of_bytes =
           zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "RCV zmq_msg_recv (correlation id) failed.");
  }

  if (zmq_msg_size(&zmq_msg)) {
    std::string correlation_id =
        std::string((char *)zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
    msg.set(MessageAttribute::CORRELATION_ID, correlation_id);
    DL_TRACE(log_context, "Received correlation_id: " << correlation_id);
  }

  // Check to see if there are more parts if there are we are not currently set
  // up to handle it so you should throw an error
  if (!zmq_msg_more(&zmq_msg)) {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "Should be receiving messages after correlation id. The key "
              "should follow but is not.");
  }
  zmq_msg_close(&zmq_msg);
}

void receiveKey(IMessage &msg, void *incoming_zmq_socket,
                LogContext log_context) {
  // If the UID metadata is set, use is; otherwise get the UID from the message
  zmq_msg_t zmq_msg;
  zmq_msg_init(&zmq_msg);
  int number_of_bytes = 0;
  if ((number_of_bytes =
           zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "RCV zmq_msg_recv (key) failed.");
  }

  if (zmq_msg_size(&zmq_msg)) {
    std::string key =
        std::string((char *)zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
    msg.set(MessageAttribute::KEY, key);
    DL_TRACE(log_context, "Received key: " << key);
  }

  // Check to see if there are more parts if there are we are not currently set
  // up to handle it so you should throw an error
  if (!zmq_msg_more(&zmq_msg)) {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "Should be receiving messages after key. The user ID should "
              "follow but is not.");
  }
  zmq_msg_close(&zmq_msg);
}

void sendCorrelationID(IMessage &msg, void *outgoing_zmq_socket) {
  zmq_msg_t zmq_msg;
  if (msg.exists(MessageAttribute::CORRELATION_ID)) {
    const std::string correlation_id =
        std::get<std::string>(msg.get(MessageAttribute::CORRELATION_ID));
    zmq_msg_init_size(&zmq_msg, correlation_id.size());
    memcpy(zmq_msg_data(&zmq_msg), correlation_id.c_str(),
           correlation_id.size());
  } else {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "zmq_msg_send (correlation id) failed. Message missing "
              "correlation id, something is really wrong.");
  }

  int number_of_bytes = 0;
  if ((number_of_bytes =
           zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE)) < 0) {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "zmq_msg_send (correlation_id) failed.");
  }

  zmq_msg_close(&zmq_msg);
}

void sendKey(IMessage &msg, void *outgoing_zmq_socket) {
  // Send message Key (if set, null otherwise)
  zmq_msg_t zmq_msg;
  if (msg.exists(MessageAttribute::KEY)) {
    const std::string key =
        std::get<std::string>(msg.get(MessageAttribute::KEY));
    zmq_msg_init_size(&zmq_msg, key.size());
    memcpy(zmq_msg_data(&zmq_msg), key.c_str(), key.size());
  } else {
    std::string no_key("no key");
    zmq_msg_init_size(&zmq_msg, no_key.size());
    memcpy(zmq_msg_data(&zmq_msg), no_key.c_str(), no_key.size());
  }

  int number_of_bytes =
           zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);

  zmq_msg_close(&zmq_msg);
  if( number_of_bytes < 0 ) {
    EXCEPT(1, "zmq_msg_send (uid) failed.");
  }
}

void receiveID(IMessage &msg, void *incoming_zmq_socket,
               LogContext log_context) {
  // If the UID metadata is set, use is; otherwise get the UID from the message
  zmq_msg_t zmq_msg;
  zmq_msg_init(&zmq_msg);
  int number_of_bytes = 0;
  if ((number_of_bytes =
           zmq_msg_recv(&zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT)) < 0) {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "RCV zmq_msg_recv (uid) failed.");
  }
  if (zmq_msg_size(&zmq_msg)) {
    std::string id =
        std::string((char *)zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
    msg.set(MessageAttribute::ID, id);
    DL_TRACE(log_context, "Received id: " << id);
  }

  // Check to see if there are more parts if there are we are not currently set
  // up to handle it so you should throw an error
  if (!zmq_msg_more(&zmq_msg)) {
    zmq_msg_close(&zmq_msg);
    EXCEPT(1, "Should be receiving messages after id. The frame should follow "
              "but is not.");
  }
  zmq_msg_close(&zmq_msg);
}

void sendID(IMessage &msg, void *outgoing_zmq_socket) {
  // Send message Key (if set, null otherwise)
  zmq_msg_t zmq_msg;
  if (msg.exists(MessageAttribute::ID)) {
    const std::string id = std::get<std::string>(msg.get(MessageAttribute::ID));
    zmq_msg_init_size(&zmq_msg, id.size());
    memcpy(zmq_msg_data(&zmq_msg), id.c_str(), id.size());
  } else {
    std::string no_id("no id");
    zmq_msg_init_size(&zmq_msg, no_id.size());
    memcpy(zmq_msg_data(&zmq_msg), no_id.c_str(), no_id.size());
  }

  int number_of_bytes =
           zmq_msg_send(&zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE);
  zmq_msg_close(&zmq_msg);
  if( number_of_bytes < 0 ) {
    EXCEPT(1, "zmq_msg_send (uid) failed.");
  }
}

} // namespace

/******************************************************************************
 * Private Class Methods
 ******************************************************************************/

ICommunicator::Response
ZeroMQCommunicator::m_poll(uint32_t timeout_milliseconds) {
  zmq_pollitem_t items[] = {{m_zmq_socket, 0, ZMQ_POLLIN, 0}};
  const int num_items_in_array = 1;
  int events_detected = 0;
  events_detected = zmq_poll(items, num_items_in_array, timeout_milliseconds);
  Response response;
  if (events_detected == -1) {
    response.error = true;
    response.error_msg = "ZMQ error number: " + std::to_string(zmq_errno());
    response.error_msg += " msg: " + std::string(zmq_strerror(zmq_errno()));
    return response;
  } else if (events_detected == 0) {
    response.time_out = true;
    std::string error_msg = std::string(zmq_strerror(zmq_errno()));
    if (error_msg.size()) {
      response.error_msg += " msg: " + error_msg;
    }
    return response;
  } else {
    response.events = events_detected;
  }
  return response;
}

/******************************************************************************
 * Public Class Methods
 ******************************************************************************/
ZeroMQCommunicator::ZeroMQCommunicator(const SocketOptions &socket_options,
                                       const ICredentials &credentials,
                                       uint32_t timeout_on_receive_milliseconds,
                                       long timeout_on_poll_milliseconds,
                                       const LogContext &log_context)
    : m_timeout_on_receive_milliseconds(timeout_on_receive_milliseconds),
      m_timeout_on_poll_milliseconds(timeout_on_poll_milliseconds) {

  m_log_context = log_context;
  auto socket_factory = SocketFactory();
  m_socket = socket_factory.create(socket_options, credentials);

  // If running INPROC, each ZeroMQ socket should use the same context, other
  // wise they should use a different context.
  if ( socket_options.scheme == URIScheme::INPROC ) {
    m_zmq_ctx = InprocContext::getContext();
    InprocContext::increment();
  } else {
    m_zmq_ctx = zmq_ctx_new();
  }
  m_zmq_socket_type = translateToZMQSocket(m_socket.get());
  m_zmq_socket = zmq_socket(m_zmq_ctx, m_zmq_socket_type);

  // -1 - Leave to OS
  // Not sure what 0 and 1 do other than mean you are going to overide
  // the defaults
  const int keep_alive = 1;
  const int keep_alive_cnt = 20;
  const int keep_alive_idle = 540;
  const int keep_alive_intvl = 5;
  const int reconnect_ivl = 500;
  const int reconnect_ivl_max = 4000;

  const int linger_milliseconds = 1000;
  const int num_messages = 10000000;

  zmq_setsockopt(m_zmq_socket, ZMQ_RCVHWM, &num_messages, sizeof(const int));
  zmq_setsockopt(m_zmq_socket, ZMQ_SNDHWM, &num_messages, sizeof(const int));

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
    std::string error_msg =
        "ZeroMQ exceeds max number of characters allowed, allowed: ";
    error_msg +=
        std::to_string(constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE);
    error_msg +=
        " number provided " + std::to_string(id.size()) + " identity: " + id;
    DL_ERROR(m_log_context, error_msg);
    EXCEPT_PARAM(1, error_msg);
  }

  zmq_setsockopt(m_zmq_socket, ZMQ_IDENTITY, id.c_str(), id.size());

  if (m_socket->getSocketConnectionLife() == SocketConnectionLife::PERSISTENT) {
    bool failure = zmq_bind(m_zmq_socket, m_socket->getAddress().c_str()) != 0;
    if (failure) {
      std::string err_message =
          "ZeroMQ bind to address '" + m_socket->getAddress();
      err_message += "' failed. Be aware if using TCP, you must pick a ";
      err_message += "recognized name for the domain... i.e. '127.0.0.1'.";
      err_message += "ZMQ error msg: ";
      err_message += zmq_strerror(zmq_errno());
      DL_ERROR(m_log_context, err_message);
      EXCEPT_PARAM(1, err_message);
    }
  } else {
    bool failure =
        zmq_connect(m_zmq_socket, m_socket->getAddress().c_str()) != 0;
    if (failure) {
      std::string err_message =
          "ZeroMQ unable to connect to address '" + m_socket->getAddress() +
          "' failed. ZMQ error message: " + zmq_strerror(zmq_errno());
      DL_ERROR(m_log_context, err_message);
      EXCEPT_PARAM(1, err_message);
    }
  }
  if (m_zmq_socket_type == ZMQ_SUB) {
    bool failure = zmq_setsockopt(m_zmq_socket, ZMQ_SUBSCRIBE, "", 0) != 0;
    if (failure) {
      std::string err_message = "ZeroMQ unable to connect to address '" +
                                m_socket->getAddress() + "' failed.";
      DL_ERROR(m_log_context, err_message);
      EXCEPT_PARAM(1, err_message);
    }
  }
}

ZeroMQCommunicator::~ZeroMQCommunicator() {
  int rc = zmq_close(m_zmq_socket);
  if (rc) {
    std::string err_message =
        "Problem closing socket on Communicator destruct. Socket address: ";
    err_message += m_socket->getAddress().c_str();
    DL_WARNING(m_log_context, err_message);
  }

  rc = 0;
  if ( m_socket->getSocketScheme() == URIScheme::INPROC ) {
    InprocContext::decrement();
    // Only call terminate if counter is at 0;
    if( InprocContext::get() == 0 ) {
      rc = InprocContext::resetContext();
    }
  } else {
    rc = zmq_ctx_term(m_zmq_ctx);
  }
  if (rc) {
    std::string err_message =
        "Problem closing zmq context in Communicator destruct. Socket address: ";
    err_message += m_socket->getAddress().c_str();
    DL_WARNING(m_log_context, err_message);
  }

}

ICommunicator::Response
ZeroMQCommunicator::poll(const MessageType message_type) {
  Response response = m_poll(m_timeout_on_poll_milliseconds);
  LogContext log_context = m_log_context;
  if (response.error == false and response.time_out == false) {
    response.message = m_msg_factory.create(message_type);
    receiveRoute(*response.message, m_zmq_socket, log_context);
    receiveCorrelationID(*response.message, m_zmq_socket, log_context);
    receiveKey(*response.message, m_zmq_socket, log_context);
    receiveID(*response.message, m_zmq_socket, log_context);
    receiveFrame(*response.message, m_zmq_socket, log_context);

    receiveBody(*response.message, m_buffer, m_protocol_factory, m_zmq_socket,
                log_context);

    uint16_t msg_type = std::get<uint16_t>(
        response.message->get(constants::message::google::MSG_TYPE));
    ProtoBufMap proto_map;

    log_context.correlation_id = std::get<std::string>(
        response.message->get(MessageAttribute::CORRELATION_ID));
    std::string err_message = "Received message on communicator id: " + id();
    err_message += ", msg type: " + proto_map.toString(msg_type);
    err_message += ", receiving from address: " + address();
    DL_DEBUG(log_context, err_message);
  } else {
    if (response.error) {
      std::string err_message =
          "Error encountered for communicator id: " + id();
      err_message += ", error is: " + response.error_msg;
      err_message += ", receiving from address: " + address();
      DL_ERROR(log_context, err_message);
    } else if (response.time_out) {
      std::string err_message =
          "Timeout encountered for communicator id: " + id();
      err_message +=
          ", timeout occurred after: " + m_timeout_on_poll_milliseconds;
      err_message += ", receiving from address: " + address();
      DL_TRACE(log_context, err_message);
    }
  }

  return response;
}

void ZeroMQCommunicator::send(IMessage &message) {


  uint16_t msg_type =
      std::get<uint16_t>(message.get(constants::message::google::MSG_TYPE));
  ProtoBufMap proto_map;
  LogContext log_context = m_log_context;
  log_context.correlation_id =
      std::get<std::string>(message.get(MessageAttribute::CORRELATION_ID));

  int events;
  size_t events_size = sizeof(events);
  zmq_getsockopt(m_zmq_socket, ZMQ_EVENTS, &events, &events_size);

  if (events & ZMQ_POLLOUT) {
        DL_INFO(log_context, "Socket is ready to send data.");
  } else {
        DL_WARNING(log_context,"Socket send buffer is full! Messages may be dropped.");
  }

  std::string err_message = "Sending message on communicator id: " + id();
  err_message += ", to address: " + address() +
                 ", msg type: " + proto_map.toString(msg_type);
  DL_DEBUG(log_context, err_message);
  sendRoute(message, m_zmq_socket, m_zmq_socket_type);
  sendCorrelationID(message, m_zmq_socket);
  sendKey(message, m_zmq_socket);
  sendID(message, m_zmq_socket);
  sendFrame(message, m_zmq_socket);
  sendBody(message, m_buffer, m_zmq_socket);
}

ICommunicator::Response
ZeroMQCommunicator::receive(const MessageType message_type) {

  Response response = m_poll(m_timeout_on_receive_milliseconds);
  LogContext log_context = m_log_context;
  if (response.error == false and response.time_out == false) {
    response.message = m_msg_factory.create(message_type);
    receiveRoute(*response.message, m_zmq_socket, log_context);
    receiveCorrelationID(*response.message, m_zmq_socket, log_context);
    receiveKey(*response.message, m_zmq_socket, log_context);
    receiveID(*response.message, m_zmq_socket, log_context);
    receiveFrame(*response.message, m_zmq_socket, log_context);
    receiveBody(*response.message, m_buffer, m_protocol_factory, m_zmq_socket,
                log_context);

    uint16_t msg_type = std::get<uint16_t>(
        response.message->get(constants::message::google::MSG_TYPE));
    ProtoBufMap proto_map;
    log_context.correlation_id = std::get<std::string>(
        response.message->get(MessageAttribute::CORRELATION_ID));
    std::string log_message = "Received message on communicator id: " + id();
    log_message += ", msg type: " + proto_map.toString(msg_type);
    log_message += ", receiving from address: " + address();
    DL_DEBUG(log_context, log_message);
  } else {
    if (response.error) {
      std::string err_message =
          "Error encountered for communicator id: " + id();
      err_message += ", error is: " + response.error_msg;
      err_message += ", receiving from address: " + address();
      DL_ERROR(log_context, err_message);
    } else if (response.time_out) {
      std::string err_message =
          "Timeout encountered for communicator id: " + id();
      err_message +=
          ", timeout occurred after: " + m_timeout_on_poll_milliseconds;
      err_message += ", receiving from address: " + address();
      DL_TRACE(log_context, err_message);
    }
  }
  return response;
}

const std::string ZeroMQCommunicator::id() const noexcept {
  char id_buffer[constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE];
  size_t id_size = constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE;
  zmq_getsockopt(m_zmq_socket, ZMQ_IDENTITY, id_buffer, &id_size);
  return std::string(id_buffer, id_size);
}

const std::string ZeroMQCommunicator::address() const noexcept {
  if (m_socket) {
    return m_socket->getAddress();
  }
  return std::string("");
}
} // namespace SDMS
