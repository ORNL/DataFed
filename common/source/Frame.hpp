#ifndef FRAME_HPP
#define FRAME_HPP
#pragma once

// Local public includes
#include "common/IMessage.hpp"

// Third party includes
#include <zmq.hpp>

// Standard includes
#include <cstdint>

namespace SDMS {

// Forward declarations
class ProtoBufMap;

struct Frame {

  uint32_t size = 0;  ///< Size of buffer in bytes
  uint8_t proto_id =
      0;               ///< Protocol ID (defined by Protocol enum in proto file)
  uint8_t msg_id = 0;  ///< Message ID (defined by alphabetical order of message
                       ///< names in proto file)
  uint16_t context = 0;  ///< Optional context value

  void clear() {
    size = 0;
    proto_id = 0;
    msg_id = 0;
    context = 0;
  }

  /// Message type is 16 bits with protocol ID as the upper 8 bits and message
  /// ID as the lower 8 bits
  inline uint16_t getMsgType() const {
    return (((uint16_t)proto_id) << 8) | msg_id;
  }
};

class FrameConverter {
 public:
  /**
   * Make sure that zmq_msg_init is not called on this message before it
   * is passed in.
   **/
  enum class CopyDirection { TO_FRAME, FROM_FRAME };

  void copy(CopyDirection copy, zmq_msg_t& zmq_msg, Frame& frame);
  void copy(CopyDirection copy, IMessage& msg, const Frame& frame);
};

class FrameFactory {
 public:
  Frame create(::google::protobuf::Message& a_msg, ProtoBufMap& proto_map);
  Frame create(const IMessage& msg);
  Frame create(zmq_msg_t& zmq_msg);
};

}  // namespace SDMS

#endif  // FRAME_HPP
