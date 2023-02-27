#ifndef PROTOBUFFACTORY_HPP
#define PROTOBUFFACTORY_HPP
#pragma once

// Local public includes
#include "ProtoBufMap.hpp"
#include <SDMS_Anon.pb.h>
#include <SDMS_Auth.pb.h>
#include "TraceException.hpp"

// Standard includes
#include <memory>

namespace SDMS {

  class ProtoBufFactory {
      ProtoBufMap m_proto_map;
      ::google::protobuf::MessageFactory * m_factory;
    public: 
      ProtoBufFactory(); 
      std::unique_ptr<::google::protobuf::Message> create(uint16_t desc_type);
      std::unique_ptr<::google::protobuf::Message> create(const ::google::protobuf::Descriptor * msg_descriptor);
  };

}

#endif // PROTOBUFFACTORY_HPP
