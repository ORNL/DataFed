/**
 * @file Frame.hpp
 * @brief Wire-level frame header and conversion utilities for the SDMS
 *        messaging transport layer.
 *
 * Defines the fixed-size Frame header that prefixes every message on the wire,
 * along with FrameConverter (for copying between Frame and ZMQ/IMessage
 * representations) and FrameFactory (for constructing Frame headers from
 * various message sources).
 */

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

/**
 * @struct Frame
 * @brief Fixed-size 8-byte header that precedes every message on the wire.
 *
 * Contains the serialized payload size, the message type identifier (envelope
 * field number), and an optional application-defined context value. Fields are
 * converted to/from network byte order at the ZMQ serialization boundary.
 */
struct Frame {
  uint32_t size = 0;     ///< Size of the serialized payload in bytes.
  uint16_t msg_type = 0; ///< Message type ID (envelope field number).
  uint16_t context = 0;  ///< Optional application-defined context value.

  /**
   * @brief Resets all fields to zero.
   */
  void clear() {
    size = 0;
    msg_type = 0;
    context = 0;
  }
};

/**
 * @class FrameConverter
 * @brief Copies data between Frame headers and ZMQ or IMessage representations.
 *
 * Provides bidirectional conversion for ZMQ messages. The IMessage overload
 * only supports the FROM_FRAME direction (Frame → IMessage); the reverse
 * is unsupported and will throw.
 */
class FrameConverter {
public:
  /** @brief Specifies the direction of a copy operation. */
  enum class CopyDirection {
    TO_FRAME,  ///< Deserialize: copy from source into Frame.
    FROM_FRAME ///< Serialize: copy from Frame into destination.
  };

  /**
   * @brief Copies between a raw ZMQ message buffer and a Frame.
   *
   * The ZMQ message must be pre-initialized and sized to exactly 8 bytes
   * (sizeof(Frame)) before calling. For the FROM_FRAME direction, use:
   * @code
   *   zmq_msg_init_size(&zmq_msg, 8);
   * @endcode
   *
   * @param copy    Direction of the copy operation.
   * @param zmq_msg Pre-initialized ZMQ message of exactly 8 bytes.
   * @param frame   Frame to populate (TO_FRAME) or read from (FROM_FRAME).
   *
   * @throws TraceException if zmq_msg size != sizeof(Frame).
   */
  void copy(CopyDirection copy, zmq_msg_t &zmq_msg, Frame &frame);

  /**
   * @brief Copies frame fields from a Frame into an IMessage.
   *
   * @note Only CopyDirection::FROM_FRAME is supported. Passing TO_FRAME
   *       will throw.
   *
   * @param copy  Must be CopyDirection::FROM_FRAME.
   * @param msg   IMessage to populate with frame metadata.
   * @param frame Source Frame to read from.
   *
   * @throws TraceException if direction is TO_FRAME.
   */
  void copy(CopyDirection copy, IMessage &msg, const Frame &frame);
};

/**
 * @class FrameFactory
 * @brief Constructs Frame headers from various message representations.
 *
 * Each overload computes the payload size and resolves the message type ID
 * appropriate to the source type. The context field is only populated when
 * constructing from an IMessage that carries it.
 */
class FrameFactory {
public:
  /**
   * @brief Creates a Frame from a protobuf Message, resolving the type ID
   *        via ProtoBufMap.
   *
   * The context field is left at its default (0).
   *
   * @param a_msg      Protobuf message (ByteSizeLong() determines frame size).
   * @param proto_map  Registry used to look up the message type ID.
   * @return A Frame with size and msg_type populated.
   */
  Frame create(::google::protobuf::Message &a_msg, ProtoBufMap &proto_map);

  /**
   * @brief Creates a Frame by extracting metadata from an IMessage.
   *
   * All three fields (FRAME_SIZE, MSG_TYPE, CONTEXT) must be present in the
   * IMessage or the call will throw.
   *
   * @param msg The IMessage containing frame metadata.
   * @return A fully populated Frame.
   * @throws TraceException if any required field is missing from the IMessage.
   */
  Frame create(const IMessage &msg);

  /**
   * @brief Creates a Frame by deserializing a raw ZMQ message.
   *
   * Returns a zeroed Frame if the ZMQ message is empty.
   *
   * @param zmq_msg Raw ZMQ message containing serialized frame bytes.
   * @return The deserialized Frame, or a zeroed Frame if empty.
   */
  Frame create(zmq_msg_t &zmq_msg);
};

} // namespace SDMS

#endif // FRAME_HPP
