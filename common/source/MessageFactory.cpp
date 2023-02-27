
// Local private includes
#include "messages/GoogleProtoMessage.hpp"

// Local public includes
#include "IMessage.hpp"
#include "MessageFactory.hpp"
#include "TraceException.hpp"

// Standard includes
#include <memory>

namespace SDMS {

    std::unique_ptr<IMessage> MessageFactory::create(const MessageType msg_type) const {
      
      if(msg_type == MessageType::GOOGLE_PROTOCOL_BUFFER ) {
        return std::unique_ptr<IMessage>( new GoogleProtoMessage() ) ;
      }
      EXCEPT(1, "Unsupported MessageType specified in MessageFactory.");

    }
} // namespace SDMS
