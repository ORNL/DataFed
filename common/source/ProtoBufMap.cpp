
// Local public includes
#include "common/ProtoBufMap.hpp"
#include "common/envelope.pb.h"
#include "common/TraceException.hpp"

// Third party includes
#include <google/protobuf/descriptor.h>
#include <google/protobuf/message.h>

namespace proto = ::google::protobuf;

namespace SDMS {

ProtoBufMap::ProtoBufMap() {}

uint16_t ProtoBufMap::getMessageType(const ::google::protobuf::Message& msg) const {
    // If it's an Envelope, use the envelope method
  const SDMS::Envelope* env = dynamic_cast<const SDMS::Envelope*>(&msg);
  if (env) {

    const auto* reflection = env->GetReflection();
    const auto* descriptor = env->GetDescriptor();

    for (int i = 0; i < descriptor->field_count(); ++i) {
      const auto* field = descriptor->field(i);
      if (field->type() == proto::FieldDescriptor::TYPE_MESSAGE) {
        if (reflection->HasField(*env, field)) {
          return static_cast<uint16_t>(field->number());
        }
      }
    }

  }
    
    // Otherwise, look up by message type name
    const auto* msg_desc = msg.GetDescriptor();
    return getMessageType(msg_desc->name());
}

const proto::Descriptor* ProtoBufMap::getDescriptorType(uint16_t field_number) const {
    const auto* envelope_desc = SDMS::Envelope::descriptor();
    const auto* field = envelope_desc->FindFieldByNumber(field_number);
    if (field && field->type() == proto::FieldDescriptor::TYPE_MESSAGE) {
        return field->message_type();
    }
    return nullptr;
}

uint16_t ProtoBufMap::getMessageType(const std::string& message_name) const {
    const auto* envelope_desc = SDMS::Envelope::descriptor();
    
    for (int i = 0; i < envelope_desc->field_count(); ++i) {
        const auto* field = envelope_desc->field(i);
        if (field->type() == proto::FieldDescriptor::TYPE_MESSAGE) {
            if (field->message_type()->name() == message_name) {
                return static_cast<uint16_t>(field->number());
            }
        }
    }
    
    EXCEPT_PARAM(EC_INVALID_PARAM, 
                 "Message name \"" << message_name << "\" not found in Envelope");
}

std::string ProtoBufMap::toString(uint16_t field_number) const {
    const auto* desc = getDescriptorType(field_number);
    if (desc) {
        return desc->name();
    }
    return "Unknown(" + std::to_string(field_number) + ")";
}

bool ProtoBufMap::exists(uint16_t field_number) const {
    return getDescriptorType(field_number) != nullptr;
}


} // namespace SDMS
