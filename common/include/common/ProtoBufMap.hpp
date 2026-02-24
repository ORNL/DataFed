/**
 * @file ProtoBufMap.hpp
 * @brief Provides message type mapping and envelope wrap/unwrap for the SDMS
 *        protobuf messaging layer.
 *
 * ProtoBufMap maintains bidirectional mappings between envelope field numbers
 * (used as stable message type identifiers) and protobuf Descriptor objects.
 * It also handles serialization boundary concerns via the Envelope message
 * pattern, wrapping outgoing messages and unwrapping incoming ones.
 */

#ifndef PROTOBUFMAP_HPP
#define PROTOBUFMAP_HPP
#pragma once

// Public common includes
#include "IMessageMapper.hpp"
#include "common/envelope.pb.h"

// Third party includes
#include <google/protobuf/descriptor.h>
#include <google/protobuf/message.h>

// Standard includes
#include <map>
#include <unordered_map>
#include <cstdint>

namespace SDMS {

/**
 * @class ProtoBufMap
 * @brief Bidirectional message type registry and envelope serialization layer.
 *
 * Maps between uint16_t message type identifiers (derived from envelope field
 * numbers) and protobuf Descriptor/FileDescriptor objects. Implements the
 * IMessageMapper interface and provides envelope wrap/unwrap operations for
 * wire-boundary serialization.
 *
 * Message type identifiers are organized by category:
 * - 10–29: Anonymous (no-auth) messages
 * - 200–249: Record messages
 * - etc.
 *
 * @see IMessageMapper
 * @see SDMS::Envelope
 */
class ProtoBufMap : public IMessageMapper {
public:
  /** @brief Maps a file index to its protobuf FileDescriptor. */
  typedef std::map<uint8_t, const ::google::protobuf::FileDescriptor *>
      FileDescriptorMap;

  /** @brief Maps a message type ID (envelope field number) to its Descriptor. */
  typedef std::map<uint16_t, const ::google::protobuf::Descriptor *>
      DescriptorMap;

  /** @brief Reverse mapping from Descriptor back to message type ID. */
  typedef std::map<const ::google::protobuf::Descriptor *, uint16_t> MsgTypeMap;

private:
  FileDescriptorMap m_file_descriptor_map; ///< Registered file descriptors.
  DescriptorMap m_descriptor_map;          ///< Type ID → Descriptor lookup.
  MsgTypeMap m_msg_type_map;               ///< Descriptor → type ID lookup.

public:
  /**
   * @brief Constructs the map and populates all mappings from the Envelope
   *        descriptor's oneof fields.
   *
   * Iterates the Envelope message descriptor via reflection to register every
   * message field, using each field's number as the stable type identifier.
   */
  ProtoBufMap();

  /**
   * @brief Retrieves the Descriptor for a given message type ID.
   *
   * @param message_type Envelope field number identifying the message type.
   * @return Pointer to the Descriptor, or nullptr if not found.
   */
  const ::google::protobuf::Descriptor *
  getDescriptorType(uint16_t message_type) const;

  /**
   * @brief Checks whether a message type ID is registered.
   *
   * @param message_type Envelope field number to look up.
   * @return True if the type is registered, false otherwise.
   */
  bool exists(uint16_t message_type) const;

  /**
   * @brief Resolves the message type ID for a concrete protobuf message.
   *
   * @param msg A protobuf message instance.
   * @return The envelope field number corresponding to the message's type.
   * @throws std::runtime_error If the message type is not registered.
   */
  uint16_t getMessageType(const ::google::protobuf::Message &msg) const;

  /**
   * @brief Returns a human-readable name for a message type ID.
   *
   * @param MessageType Envelope field number identifying the message type.
   * @return The full protobuf type name, or an error string if not found.
   */
  std::string toString(uint16_t MessageType) const;

  /**
   * @brief Resolves a message type ID from a protobuf message type name string.
   *
   * @param message_name Fully-qualified or short protobuf message name.
   * @return The corresponding envelope field number.
   * @throws std::runtime_error If the name does not match any registered type.
   */
  virtual uint16_t
  getMessageType(const std::string &message_name) const final;

  /**
   * @brief Wraps an inner message into an Envelope for wire transmission.
   *
   * Resolves the inner message's type ID via getMessageType(), then uses
   * reflection to set the corresponding oneof field in a new Envelope by
   * copying from the inner message.
   *
   * @param inner The message to wrap.
   * @return A populated Envelope ready for serialization.
   * @throws EC_INVALID_PARAM If the resolved field number does not exist
   *         in the Envelope descriptor.
   */
  std::unique_ptr<SDMS::Envelope>
  wrapInEnvelope(const ::google::protobuf::Message &inner) const;

  /**
   * @brief Extracts the inner message from a received Envelope.
   *
   * Uses reflection to determine which oneof field is set, then calls
   * ReleaseMessage() to transfer ownership of the inner message out of
   * the envelope. After this call, the released field in @p envelope is
   * cleared.
   *
   * @param envelope The received Envelope to unwrap. Modified in place —
   *                 the released field is no longer owned by the envelope.
   * @return The extracted inner message. Caller takes ownership.
   * @throws EC_INVALID_PARAM If the envelope's message type cannot be
   *         resolved to a valid field.
   */
  std::unique_ptr<::google::protobuf::Message>
  unwrapFromEnvelope(SDMS::Envelope &envelope) const;

  /**
   * @brief Determines whether a message type requires authentication.
   *
   * Messages in the anonymous set (e.g., version handshake, authentication
   * requests) do not require a prior authenticated session. All other
   * message types do.
   *
   * @param msg_type Short message type name (e.g., "VersionRequest").
   * @return True if the message requires an authenticated session, false if
   *         it is in the anonymous (no-auth) set.
   */
  virtual bool requiresAuth(const std::string &msg_type) const final {
    static const std::unordered_set<std::string> anon_types = {
        "AckReply",
        "NackReply",
        "VersionRequest",
        "VersionReply",
        "GetAuthStatusRequest",
        "AuthenticateByPasswordRequest",
        "AuthenticateByTokenRequest",
        "AuthStatusReply",
        "DailyMessageRequest",
        "DailyMessageReply"};
    return anon_types.count(msg_type) == 0;
  }
};

} // namespace SDMS

#endif // PROTOBUFMAP_HPP
