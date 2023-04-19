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

    /**
     * Will create a Mesage envelope without the payload but containing the
     * routes so we know who to send the message too. This is meant to 
     * be used from the server side of an async request reply model.
     **/
    std::unique_ptr<IMessage> createResponseEnvelope(const IMessage & ) const;
};

} // namespace SDMS

#endif // PROTOCOL_FACTORY_HPP
