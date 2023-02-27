#ifndef PROTOBUFMAP_HPP
#define PROTOBUFMAP_HPP
#pragma once

// Third party includes
#include <google/protobuf/message.h>
#include <google/protobuf/descriptor.h>

// Standard includes
#include <map>

namespace SDMS {
  
  class ProtoBufMap {
    public:
      typedef std::map<uint8_t,const ::google::protobuf::FileDescriptor *>    FileDescriptorMap;
      typedef std::map<uint16_t,const ::google::protobuf::Descriptor *>       DescriptorMap;
      typedef std::map<const ::google::protobuf::Descriptor *,uint16_t>       MsgTypeMap;

      enum ErrorCode
      {
          EC_OK = 0,
          EC_PROTO_INIT,
          EC_INVALID_PARAM,
          EC_INVALID_STATE,
          EC_SERIALIZE,
          EC_UNSERIALIZE
      };

    private:

      FileDescriptorMap m_file_descriptor_map;
      DescriptorMap m_descriptor_map;
      MsgTypeMap m_msg_type_map;

    public:
      ProtoBufMap();

      const ::google::protobuf::Descriptor * getDescriptorType(uint16_t message_type) const;
      uint16_t getMessageType(::google::protobuf::Message &);
      uint16_t getMessageType(uint8_t a_proto_id, const std::string & a_message_name);
  };
}

#endif // PROTOBUFMAP_HPP
