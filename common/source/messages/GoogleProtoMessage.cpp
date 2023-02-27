
// Local private includes
#include "Frame.hpp"
#include "GoogleProtoMessage.hpp"

// Local public includes
#include "TraceException.hpp"

// Standard includes
#include <memory>
#include <string>
#include <variant>
#include <vector>
#include <unordered_map>

namespace SDMS {


  GoogleProtoMessage::GoogleProtoMessage() {
    m_dyn_attributes[constants::message::google::FRAME_SIZE] = (uint32_t)0; 
    m_dyn_attributes[constants::message::google::PROTO_ID] = (uint8_t)0;
    m_dyn_attributes[constants::message::google::MSG_ID] = (uint8_t)0;
    m_dyn_attributes[constants::message::google::MSG_TYPE] = (uint16_t) 0;
    m_dyn_attributes[constants::message::google::CONTEXT] = (uint16_t)0;
  }

  bool GoogleProtoMessage::exists(MessageAttribute attribute_type) const {
    return m_attributes.count(attribute_type) != 0;
  }
  bool GoogleProtoMessage::exists(const std::string & attribute_type) const {
    return m_dyn_attributes.count(attribute_type) != 0;
  }

  /**
   * Setters
   **/
  void GoogleProtoMessage::setPayload(
      std::variant<std::unique_ptr<::google::protobuf::Message>,std::string> payload) {
    if( std::holds_alternative<std::unique_ptr<::google::protobuf::Message>>(payload) ) {
      // Because the frame depends on the payload, the frame needs to be created
      // here
      FrameFactory frame_factory;
      Frame frame = frame_factory.create(*std::get<std::unique_ptr<::google::protobuf::Message>>(payload), m_proto_map);
      m_dyn_attributes[constants::message::google::FRAME_SIZE] = frame.size; 
      m_dyn_attributes[constants::message::google::PROTO_ID] = frame.proto_id;
      m_dyn_attributes[constants::message::google::MSG_ID] = frame.msg_id;
      m_dyn_attributes[constants::message::google::MSG_TYPE] = frame.getMsgType();
      m_dyn_attributes[constants::message::google::CONTEXT] = frame.context;
      m_payload = std::move(std::get<std::unique_ptr<::google::protobuf::Message>>(payload));
    } else {
      EXCEPT(1, "Attempt to add unsupported payload to GoogleProtoMessage.");
    }
  }

  void GoogleProtoMessage::set(MessageAttribute attribute_type, const std::string & attribute) {
    if( attribute_type == MessageAttribute::ID ) {
      m_attributes[MessageAttribute::ID] = attribute;
    } else if (attribute_type == MessageAttribute::KEY ) {
      m_attributes[MessageAttribute::KEY] = attribute;
    } else {
      EXCEPT(1, "Attempt to add unsupported attribute to GoogleProtoMessage.");
    }
  }

  void GoogleProtoMessage::set(std::string attribute_name, std::variant<uint8_t, uint16_t, uint32_t> value) {
    if( m_dyn_attributes.count(attribute_name) ) {
      m_dyn_attributes[attribute_name] = value;
    } else {
      EXCEPT_PARAM(1, "Unable to set GoogleProtoMessage with attribute it is unsuppored: " << attribute_name);
    }
  }

  /**
   * Getters
   **/
  std::string GoogleProtoMessage::get(MessageAttribute attribute_type) const {
    if(exists(attribute_type) ) {
      return m_attributes.at(attribute_type);
    } else {
      EXCEPT_PARAM(1, "Attempt to get unsupported attribute type from GoogleProtoMessage." << toString(attribute_type) );
    }
  }

  std::variant<uint8_t, uint16_t, uint32_t> GoogleProtoMessage::get(const std::string & attribute_name) const {
    if(exists(attribute_name) ) {
      return m_dyn_attributes.at(attribute_name);
    } else {
      EXCEPT_PARAM(1, "Attempt to get unsupported attribute type from GoogleProtoMessage." << attribute_name);
    }
  }

  std::variant<::google::protobuf::Message *,std::string> GoogleProtoMessage::getPayload() {
    ::google::protobuf::Message * raw_ptr = m_payload.get();
    return raw_ptr;
  }

} // namespace SDMS

