// Local private includes
#include "ProtoBufFactory.hpp"

// Local public includes
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/TraceException.hpp"

// Standard includes
#include <memory>

namespace SDMS {

ProtoBufFactory::ProtoBufFactory() {
  Anon::Protocol_descriptor();
  Auth::Protocol_descriptor();
  m_factory = ::google::protobuf::MessageFactory::generated_factory();
}

std::unique_ptr<::google::protobuf::Message> ProtoBufFactory::create(
    uint16_t desc_type) {
  const ::google::protobuf::Descriptor* msg_descriptor =
      m_proto_map.getDescriptorType(desc_type);
  return create(msg_descriptor);
}

// https://stackoverflow.com/questions/29960871/protobuf-message-object-creation-by-name
std::unique_ptr<::google::protobuf::Message> ProtoBufFactory::create(
    const ::google::protobuf::Descriptor* msg_descriptor) {
  const ::google::protobuf::Message* prototype_msg =
      m_factory->GetPrototype(msg_descriptor);

  if (prototype_msg == nullptr) {
    EXCEPT(1, "Cannot create prototype message from message descriptor");
  }

  ::google::protobuf::Message* mutable_msg = prototype_msg->New();

  if (mutable_msg == nullptr) {
    EXCEPT(1, "Failed in prototype_msg->New(); to create mutable message");
  }

  return std::unique_ptr<::google::protobuf::Message>(mutable_msg);
}

}  // namespace SDMS
