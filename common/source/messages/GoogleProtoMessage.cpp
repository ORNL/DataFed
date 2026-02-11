
// Local private includes
#include "GoogleProtoMessage.hpp"
#include "Frame.hpp"

// Local public includes
#include "common/TraceException.hpp"

// Third party includes
#include <boost/uuid/uuid.hpp>
#include <boost/uuid/uuid_generators.hpp>
#include <boost/uuid/uuid_io.hpp>

// Standard includes
#include <memory>
#include <string>
#include <unordered_map>
#include <variant>

namespace SDMS {

GoogleProtoMessage::GoogleProtoMessage() {
  m_dyn_attributes[constants::message::google::FRAME_SIZE] = (uint32_t)0;
  m_dyn_attributes[constants::message::google::MSG_TYPE] = (uint16_t)0;
  m_dyn_attributes[constants::message::google::CONTEXT] = (uint16_t)0;

  boost::uuids::random_generator generator;
  boost::uuids::uuid uuid = generator();
  m_attributes[MessageAttribute::CORRELATION_ID] =
      boost::uuids::to_string(uuid);
}

bool GoogleProtoMessage::exists(MessageAttribute attribute_type) const {
  return m_attributes.count(attribute_type) != 0;
}
bool GoogleProtoMessage::exists(const std::string &attribute_type) const {
  return m_dyn_attributes.count(attribute_type) != 0;
}

/**
 * Setters
 **/

void GoogleProtoMessage::setPayload(
    std::variant<std::unique_ptr<::google::protobuf::Message>, std::string>
        payload) {
  if (std::holds_alternative<std::unique_ptr<::google::protobuf::Message>>(
          payload)) {
    auto &inner =
        std::get<std::unique_ptr<::google::protobuf::Message>>(payload);

    // msg_type come from the inner message's
    // envelope field number — this is already correct
    FrameFactory frame_factory;
    Frame frame = frame_factory.create(*inner, m_proto_map);

    // FRAME_SIZE must reflect what goes on the wire: the Envelope,
    // not the inner message
    auto temp_envelope = m_proto_map.wrapInEnvelope(*inner);
    frame.size = static_cast<uint32_t>(temp_envelope->ByteSizeLong());

    m_dyn_attributes[constants::message::google::FRAME_SIZE] = frame.size;
    m_dyn_attributes[constants::message::google::MSG_TYPE] = frame.msg_type;

    // Store the INNER message, not the envelope
    m_payload = std::move(inner);
  } else {
    EXCEPT(1, "Attempt to add unsupported payload to GoogleProtoMessage.");
  }
}

void GoogleProtoMessage::set(MessageAttribute attribute_type,
                             const std::string &attribute) {
  if (attribute_type == MessageAttribute::ID) {
    m_attributes[MessageAttribute::ID] = attribute;
  } else if (attribute_type == MessageAttribute::KEY) {
    m_attributes[MessageAttribute::KEY] = attribute;
  } else if (attribute_type == MessageAttribute::CORRELATION_ID) {
    m_attributes[MessageAttribute::CORRELATION_ID] = attribute;
  } else {
    EXCEPT(1, "Attempt to add unsupported attribute to GoogleProtoMessage.");
  }
}

void GoogleProtoMessage::set(MessageAttribute attribute_type,
                             MessageState state) {
  if (attribute_type == MessageAttribute::STATE) {
    m_state = state;
  } else {
    EXCEPT(1, "Attempt to add unsupported attribute to GoogleProtoMessage.");
  }
}

void GoogleProtoMessage::set(std::string attribute_name,
                             std::variant<uint8_t, uint16_t, uint32_t> value) {
  if (m_dyn_attributes.count(attribute_name)) {
    m_dyn_attributes[attribute_name] = value;
  } else {
    EXCEPT_PARAM(
        1, "Unable to set GoogleProtoMessage with attribute it is unsuppored: "
               << attribute_name);
  }
}

/**
 * Getters
 **/
std::variant<std::string, MessageState>
GoogleProtoMessage::get(MessageAttribute attribute_type) const {
  if (attribute_type == MessageAttribute::STATE) {
    return m_state;
  } else if (exists(attribute_type)) {
    return m_attributes.at(attribute_type);
  } else {
    EXCEPT_PARAM(
        1, "Attempt to get unsupported attribute type from GoogleProtoMessage."
               << toString(attribute_type));
  }
}

std::variant<uint8_t, uint16_t, uint32_t>
GoogleProtoMessage::get(const std::string &attribute_name) const {
  if (exists(attribute_name)) {
    return m_dyn_attributes.at(attribute_name);
  } else {
    EXCEPT_PARAM(
        1, "Attempt to get unsupported attribute type from GoogleProtoMessage."
               << attribute_name);
  }
}

std::variant<::google::protobuf::Message *, std::string>
GoogleProtoMessage::getPayload() {
  ::google::protobuf::Message *raw_ptr = m_payload.get();
  return raw_ptr;
}

} // namespace SDMS
