#ifndef MESSAGE_HPP
#define MESSAGE_HPP
#pragma once

// Standard includes
#include <list>
#include <memory>
#include <string>
#include <variant>

// Forward declaration
namespace google {
namespace protobuf {
class Message;
}
}; // namespace google

namespace SDMS {

/**
 * @enum MessageType
 * @brief Discriminator for the payload type carried by an IMessage.
 */
enum class MessageType {
  GOOGLE_PROTOCOL_BUFFER, ///< Payload is a google::protobuf::Message.
  STRING                  ///< Payload is a plain std::string.
};

/**
 * @enum MessageState
 * @brief Indicates the directional state of a message relative to a server.
 *
 * - @c REQUEST  — the message is traveling *toward* a server.
 * - @c RESPONSE — the message is traveling *from* a server.
 */
enum class MessageState { REQUEST, RESPONSE };

/**
 * @enum MessageAttribute
 * @brief Named keys for the core metadata attributes stored on a message.
 */
enum class MessageAttribute {
  ID,             ///< Unique message identifier.
  KEY,            ///< Routing or lookup key.
  STATE,          ///< Current MessageState (REQUEST or RESPONSE).
  CORRELATION_ID  ///< Identifier used to correlate requests with responses.
};

/**
 * @brief Convert a MessageAttribute to its human-readable string form.
 *
 * @param[in] attribute The attribute to stringify.
 * @return A string representation, or @c "unsupported_toString_print" if
 *         the attribute does not have a defined conversion.
 *
 * @note Only ID and KEY are currently supported; all other values fall
 *       through to the unsupported case.
 */
inline const std::string toString(const MessageAttribute attribute) {
  if (attribute == MessageAttribute::ID) {
    return std::string("ID");
  } else if (attribute == MessageAttribute::KEY) {
    return std::string("KEY");
  } else {
    return std::string("unsupported_toString_print");
  }
}

/// @brief Well-known string constants used throughout the messaging layer.
namespace constants {
namespace message {
namespace google {
/// @brief Key for the serialized frame size of a protobuf message.
const std::string FRAME_SIZE = "frame_size";
/// @brief Key for the integral message-type identifier (e.g. envelope field number).
const std::string MSG_TYPE = "msg_type";
/// @brief Key for the security/session context attached to a message.
const std::string CONTEXT = "context";
} // namespace google
} // namespace message
} // namespace constants

/**
 * @class IMessage
 * @brief Abstract interface for all messages exchanged through the SDMS
 *        messaging infrastructure.
 *
 * IMessage defines a uniform contract for:
 * - **Payload management** — carrying either a protobuf Message or a raw
 *   string, with ownership semantics enforced by the implementation.
 * - **Routing** — an ordered list of route identifiers that determines
 *   how a message is forwarded through the system.
 * - **Metadata** — core attributes (ID, KEY, STATE, CORRELATION_ID) plus
 *   arbitrary named attributes with small-integer values.
 *
 * Implementations are expected to own the payload and manage its lifetime.
 * Callers retrieve payload data via non-owning raw pointers or copies.
 */
class IMessage {
public:
  /// @brief Virtual destructor.
  virtual ~IMessage() {};

  /**
   * @brief Check whether a core metadata attribute has been set.
   *
   * @param[in] attribute The attribute to query.
   * @return @c true if the attribute is present on this message.
   */
  virtual bool exists(MessageAttribute attribute) const = 0;

  /**
   * @brief Check whether a named (dynamic) attribute has been set.
   *
   * @param[in] attribute_name The name of the dynamic attribute to query.
   * @return @c true if the named attribute is present on this message.
   */
  virtual bool exists(const std::string &attribute_name) const = 0;

  /*---------------------------------------------------------------------
   * Setters
   *-------------------------------------------------------------------*/

  /**
   * @brief Set the message payload.
   *
   * The implementation must take ownership of the supplied payload.  For
   * protobuf payloads the unique_ptr is moved in; for string payloads the
   * string is copied or moved.  After this call the IMessage instance is
   * solely responsible for the lifetime of the payload data.
   *
   * @param[in] payload A variant holding either a protobuf message
   *            (via @c std::unique_ptr) or a plain string.
   */
  virtual void setPayload(
      std::variant<std::unique_ptr<::google::protobuf::Message>,
                   std::string>
          payload) = 0;

  /**
   * @brief Append a single route to the end of the routing list.
   *
   * @param[in] route The route identifier to append.
   */
  virtual void addRoute(const std::string &route) = 0;

  /**
   * @brief Replace the entire routing list.
   *
   * @param[in] routes The new ordered list of route identifiers.
   */
  virtual void setRoutes(const std::list<std::string> &routes) = 0;

  /**
   * @brief Set a core metadata attribute to a string value.
   *
   * Applicable to attributes such as @c ID, @c KEY, and
   * @c CORRELATION_ID.
   *
   * @param[in] attribute The attribute to set.
   * @param[in] value     The string value to assign.
   */
  virtual void set(MessageAttribute attribute, const std::string &value) = 0;

  /**
   * @brief Set a core metadata attribute to a MessageState value.
   *
   * Intended for the @c STATE attribute.
   *
   * @param[in] attribute The attribute to set (expected: @c STATE).
   * @param[in] state     The MessageState value to assign.
   */
  virtual void set(MessageAttribute attribute, MessageState state) = 0;

  /**
   * @brief Set a named dynamic attribute to a small unsigned integer.
   *
   * Dynamic attributes are identified by string keys (e.g. the constants
   * in @c SDMS::constants::message::google).
   *
   * @param[in] attribute_name The name of the dynamic attribute.
   * @param[in] value          The value, stored as one of uint8/16/32.
   */
  virtual void set(std::string attribute_name,
                   std::variant<uint8_t, uint16_t, uint32_t> value) = 0;

  /*---------------------------------------------------------------------
   * Getters
   *-------------------------------------------------------------------*/

  /**
   * @brief Retrieve a core metadata attribute.
   *
   * The returned variant holds a @c std::string for most attributes, or a
   * @c MessageState when querying @c STATE.
   *
   * @param[in] attribute The attribute to retrieve.
   * @return A variant containing either the string value or the
   *         MessageState, depending on the attribute.
   */
  virtual std::variant<std::string, MessageState>
  get(MessageAttribute attribute) const = 0;

  /**
   * @brief Get a const reference to the ordered routing list.
   *
   * @return Const reference to the internal route list.
   */
  virtual const std::list<std::string> &getRoutes() const = 0;

  /**
   * @brief Get a mutable reference to the ordered routing list.
   *
   * @return Mutable reference to the internal route list.
   */
  virtual std::list<std::string> &getRoutes() = 0;

  /**
   * @brief Return the payload type carried by this message.
   *
   * @return The MessageType discriminator.
   */
  virtual MessageType type() const noexcept = 0;

  /**
   * @brief Retrieve a named dynamic attribute.
   *
   * @param[in] attribute_name The name of the dynamic attribute.
   * @return The value stored as a @c uint8_t, @c uint16_t, or @c uint32_t
   *         variant.
   */
  virtual std::variant<uint8_t, uint16_t, uint32_t>
  get(const std::string &attribute_name) const = 0;

  /**
   * @brief Retrieve a non-owning handle to the message payload.
   *
   * Ownership remains with the IMessage instance.  For protobuf payloads
   * a raw pointer is returned (not a @c unique_ptr) to make this
   * explicit.  For string payloads the string is returned by value (copy).
   *
   * @return A variant holding either a non-owning
   *         @c google::protobuf::Message* or a @c std::string.
   */
  virtual std::variant<google::protobuf::Message *, std::string>
  getPayload() = 0;
};

} // namespace SDMS

#endif // MESSAGE_HPP
