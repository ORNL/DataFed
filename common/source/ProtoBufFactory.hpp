#ifndef PROTOBUFFACTORY_HPP
#define PROTOBUFFACTORY_HPP
#pragma once

// Local public includes
#include "common/ProtoBufMap.hpp"
#include "common/TraceException.hpp"

// Local protobuf includes
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"

// Standard includes
#include <memory>

namespace SDMS {

class ProtoBufFactory {
  ProtoBufMap m_proto_map;
  ::google::protobuf::MessageFactory* m_factory;

 public:
  ProtoBufFactory();
  std::unique_ptr<::google::protobuf::Message> create(uint16_t desc_type);
  std::unique_ptr<::google::protobuf::Message> create(
      const ::google::protobuf::Descriptor* msg_descriptor);
};

}  // namespace SDMS

#endif  // PROTOBUFFACTORY_HPP
