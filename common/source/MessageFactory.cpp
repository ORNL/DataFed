
// Local private includes
#include "messages/GoogleProtoMessage.hpp"

// Local public includes
#include "common/IMessage.hpp"
#include "common/MessageFactory.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <memory>

namespace SDMS {

    std::unique_ptr<IMessage> MessageFactory::create(const MessageType msg_type) const {
      
      if(msg_type == MessageType::GOOGLE_PROTOCOL_BUFFER ) {
        return std::unique_ptr<IMessage>( new GoogleProtoMessage() ) ;
      }
      EXCEPT(1, "Unsupported MessageType specified in MessageFactory.");

    }

    std::unique_ptr<IMessage> MessageFactory::createResponseEnvelope(const IMessage & msg) const {
      
      if(msg.type() == MessageType::GOOGLE_PROTOCOL_BUFFER ) {
        auto new_msg = std::unique_ptr<IMessage>( new GoogleProtoMessage() ) ;
        new_msg->setRoutes(msg.getRoutes());
        new_msg->set(MessageAttribute::STATE, MessageState::RESPONSE);
        new_msg->set(MessageAttribute::CORRELATION_ID, std::get<std::string>(msg.get(MessageAttribute::CORRELATION_ID)));
        // The context is needed so when the response is sent the client knows what request it is associated with it
        uint16_t context = 0;
        try {
          context = std::get<uint16_t>(msg.get(constants::message::google::CONTEXT));
        } catch (...) {
          std::string error_msg = "Unable to generate a response message.";
          error_msg += " The context field is not registered. The context is needed by the client";
          error_msg += " to identify what request the response is associated with.";
          EXCEPT_PARAM(1, error_msg);
        }
        new_msg->set(constants::message::google::CONTEXT, context);
        return new_msg;
      }
      EXCEPT(1, "Unsupported MessageType specified in MessageFactory.");

    }

} // namespace SDMS
