// Local private includes
#include "ProtoBufFactory.hpp"

// Local public includes
#include "common/envelope.pb.h"
#include "common/TraceException.hpp"

// Standard includes
#include <memory>

namespace SDMS {

ProtoBufFactory::ProtoBufFactory() {}

std::unique_ptr<google::protobuf::Message> ProtoBufFactory::create(uint16_t desc_type) {
        const google::protobuf::Descriptor* msg_descriptor = 
            m_proto_map.getDescriptorType(desc_type);
        return create(msg_descriptor);
    }

std::unique_ptr<::google::protobuf::Message> 
 ProtoBufFactory::create(const ::google::protobuf::Descriptor* msg_descriptor) {
  const google::protobuf::Message* prototype_msg = 
    google::protobuf::MessageFactory::generated_factory()
    ->GetPrototype(msg_descriptor);

  if (prototype_msg == nullptr) {
    EXCEPT(1, "Cannot create prototype message from message descriptor");
  }

  ::google::protobuf::Message *mutable_msg = prototype_msg->New();

  if (mutable_msg == nullptr) {
    EXCEPT(1, "Failed in prototype_msg->New(); to create mutable message");
  }

  return std::unique_ptr<::google::protobuf::Message>(mutable_msg);

 }

} // namespace SDMS
