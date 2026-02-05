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

  uint32_t size = 0; ///< Size of buffer in bytes
  uint16_t msg_type = 0;
  uint16_t context = 0; ///< Optional context value

  void clear() {
    size = 0;
    msg_type = 0;
    context = 0;
  }

};

class FrameConverter {
public:
  /**
   * Make sure that zmq_msg_init is not called on this message before it
   * is passed in.
   **/
  enum class CopyDirection { TO_FRAME, FROM_FRAME };

  void copy(CopyDirection copy, zmq_msg_t &zmq_msg, Frame &frame);
  void copy(CopyDirection copy, IMessage &msg, const Frame &frame);
};

class FrameFactory {
public:
  Frame create(::google::protobuf::Message &a_msg, ProtoBufMap &proto_map);
  Frame create(const IMessage &msg);
  Frame create(zmq_msg_t &zmq_msg);
};

} // namespace SDMS

#endif // FRAME_HPP
