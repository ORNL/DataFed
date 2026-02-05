#ifndef PROTOBUFMAP_HPP
#define PROTOBUFMAP_HPP
#pragma once

// Public common includes
#include "IMessageMapper.hpp"
#include "common/envelope.pb.h"

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
  
  // Envelope wrap/unwrap for wire boundary
  std::unique_ptr<SDMS::Envelope>
  wrapInEnvelope(const ::google::protobuf::Message& inner) const;

  std::unique_ptr<::google::protobuf::Message>
  unwrapFromEnvelope(SDMS::Envelope& envelope) const;

  // Check if message type requires authentication
  virtual bool requiresAuth(const std::string& msg_type) const final {
    static const std::unordered_set<std::string> anon_types = {
      "AckReply", "NackReply", "VersionRequest", "VersionReply",
      "GetAuthStatusRequest", "AuthenticateByPasswordRequest",
      "AuthenticateByTokenRequest", "AuthStatusReply",
      "DailyMessageRequest", "DailyMessageReply"
    };
    return anon_types.count(msg_type) == 0;
  }
};
} // namespace SDMS

#endif // PROTOBUFMAP_HPP
