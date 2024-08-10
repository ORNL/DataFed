// Add Struff here
#include "StringMessage.hpp"

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

StringMessage::StringMessage() {
  boost::uuids::random_generator generator;
  boost::uuids::uuid uuid = generator();
  m_attributes[MessageAttribute::CORRELATION_ID] =
      boost::uuids::to_string(uuid);
}
// checking if specific attributes exist
bool StringMessage::exists(MessageAttribute attribute_type) const {
  return m_attributes.count(attribute_type) != 0;
}
// This is required due to inheriting from IMessage.hpp having this otherwise it
// breaks the abstraction
bool StringMessage::exists(const std::string &attribute_type) const {
  return false;
}

// Setters
void StringMessage::setPayload(
    std::variant<std::unique_ptr<::google::protobuf::Message>, std::string>
        payload) {
  if (std::holds_alternative<std::string>(payload)) {
    m_payload = std::get<std::string>(payload);
  } else {
    EXCEPT(1, "Attempt to add unsupported payload to StringMessage.");
  }
}

void StringMessage::set(MessageAttribute attribute_type,
                        const std::string &attribute) {
  if (attribute_type == MessageAttribute::ID) {
    m_attributes[MessageAttribute::ID] = attribute;
  } else if (attribute_type == MessageAttribute::KEY) {
    m_attributes[MessageAttribute::KEY] = attribute;
  } else if (attribute_type == MessageAttribute::CORRELATION_ID) {
    m_attributes[MessageAttribute::CORRELATION_ID] = attribute;
  } else if (attribute_type == MessageAttribute::ENDPOINT) {
    m_attributes[MessageAttribute::ENDPOINT] = attribute;
  } else if (attribute_type == MessageAttribute::VERB) {
    m_attributes[MessageAttribute::VERB] = attribute;
  }

  else {
    EXCEPT(1, "Attempt to add unsupported attribute to StringMessage.");
  }
}

void StringMessage::set(MessageAttribute attribute_type, MessageState state) {
  if (attribute_type == MessageAttribute::STATE) {
    m_state = state;
  } else {
    EXCEPT(1, "Attempt to add unsupported attribute to StringMessage.");
  }
}

void StringMessage::set(std::string attribute_name,
                        std::variant<uint8_t, uint16_t, uint32_t> value) {
  if (m_dyn_attributes.count(attribute_name)) {
    m_dyn_attributes[attribute_name] = value;
  } else {
    EXCEPT_PARAM(1,
                 "Unable to set StringMessage with attribute it is unsuppored: "
                     << attribute_name);
  }
}

// Getters
std::variant<std::string, MessageState>
StringMessage::get(MessageAttribute attribute_type) const {
  if (attribute_type == MessageAttribute::STATE) {
    return m_state;
  } else if (exists(attribute_type)) {
    return m_attributes.at(attribute_type);
  } else {
    EXCEPT_PARAM(1,
                 "Attempt to get unsupported attribute type from StringMessage."
                     << toString(attribute_type));
  }
}

std::variant<uint8_t, uint16_t, uint32_t>
StringMessage::get(const std::string &attribute_name) const {
  if (exists(attribute_name)) {
    return m_dyn_attributes.at(attribute_name);
  } else {
    EXCEPT_PARAM(1,
                 "Attempt to get unsupported attribute type from StringMessage."
                     << attribute_name);
  }
}

std::variant<::google::protobuf::Message *, std::string>
StringMessage::getPayload() {
  return m_payload;
}

} // namespace SDMS
