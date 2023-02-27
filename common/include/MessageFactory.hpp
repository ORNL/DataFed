#ifndef PROTOCOL_FACTORY_HPP
#define PROTOCOL_FACTORY_HPP
#pragma once

// Local includes
#include "IMessage.hpp"

// Standard includes
#include <memory>

namespace SDMS {

class MessageFactory {
  public:
    std::unique_ptr<IMessage> create(const MessageType) const;
};

} // namespace SDMS

#endif // PROTOCOL_FACTORY_HPP
