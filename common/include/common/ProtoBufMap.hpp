#ifndef PROTOBUFMAP_HPP
#define PROTOBUFMAP_HPP
#pragma once

// Public common includes
#include "IMessageMapper.hpp"

// Third party includes
#include <google/protobuf/descriptor.h>
#include <google/protobuf/message.h>

// Standard includes
#include <map>
#include <unordered_map>
#include <cstdint>

namespace SDMS {

class ProtoBufMap : public IMessageMapper {
public:
  typedef std::map<uint8_t, const ::google::protobuf::FileDescriptor *>
      FileDescriptorMap;
  typedef std::map<uint16_t, const ::google::protobuf::Descriptor *>
      DescriptorMap;
  typedef std::map<const ::google::protobuf::Descriptor *, uint16_t> MsgTypeMap;

private:
  FileDescriptorMap m_file_descriptor_map;
  DescriptorMap m_descriptor_map;
  MsgTypeMap m_msg_type_map;

public:
  ProtoBufMap();

  const ::google::protobuf::Descriptor *
  getDescriptorType(uint16_t message_type) const;
  bool exists(uint16_t message_type) const;
  uint16_t getMessageType(const ::google::protobuf::Message& msg) const;
  std::string toString(uint16_t MessageType) const;
  virtual uint16_t getMessageType(const std::string& message_name) const final;
};
} // namespace SDMS

#endif // PROTOBUFMAP_HPP
