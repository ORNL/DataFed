#ifndef IMESSAGE_MAPPER_HPP
#define IMESSAGE_MAPPER_HPP
#pragma once

// Standard includes
#include <string>
#include <cstdint>

namespace SDMS {

enum class MessageProtocol { GOOGLE_ANONONYMOUS, GOOGLE_AUTHORIZED };

class IMessageMapper {
public:
  enum ErrorCode {
    EC_OK = 0,
    EC_PROTO_INIT,
    EC_INVALID_PARAM,
    EC_INVALID_STATE,
    EC_SERIALIZE,
    EC_UNSERIALIZE
  };

public:
  virtual uint16_t getMessageType(uint8_t a_proto_id,
                                  const std::string &a_message_name) = 0;

  virtual uint8_t getProtocolID(MessageProtocol) const = 0;
};
} // namespace SDMS

#endif // IMESSAGE_MAPPER_HPP
