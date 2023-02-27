#ifndef MESSAGE_HPP
#define MESSAGE_HPP
#pragma once

// Standard includes
#include <memory>
#include <string>
#include <variant>
#include <vector>

// Forward declaration
namespace google { namespace protobuf { class Message; } };

namespace SDMS {

  enum class MessageType {
    GOOGLE_PROTOCOL_BUFFER,
    STRING
  };

  enum class MessageAttribute {
    ID,
    KEY
  };

  inline const std::string toString(const MessageAttribute attribute) {
    if ( attribute == MessageAttribute::ID ) {
      return std::string("ID");
    } else if(attribute == MessageAttribute::KEY){
      return std::string("KEY");
    } else {
      return std::string("unsupported_toString_print");
    }
  }

  namespace constants {
    namespace message {
      namespace google {
        /// Supported dynamic arguments
        const std::string FRAME_SIZE="frame_size";
        const std::string PROTO_ID="proto_id";
        const std::string MSG_ID="msg_id";
        const std::string MSG_TYPE="msg_type";
        const std::string CONTEXT="context";
      }
    }
  }

  class IMessage {
    public:


      virtual bool exists(MessageAttribute) const = 0;
      virtual bool exists(const std::string & ) const = 0;

      /**
       * Setters
       **/

      /**
       * Adding a payload should make a copy and store internally. It should
       * Imply ownership of the payload and it's memory management.
       **/
      virtual void setPayload(std::variant<std::unique_ptr<::google::protobuf::Message> ,std::string>) = 0;
      virtual void addRoute(const std::string & route) = 0; 


      virtual void set(MessageAttribute, const std::string &) = 0;

      virtual void set(std::string attribute_name, std::variant<uint8_t, uint16_t, uint32_t> ) = 0; 
      /**
       * Getters
       **/
      virtual std::string get(MessageAttribute) const = 0;
      virtual const std::vector<std::string> & getRoutes() const = 0;
      virtual std::vector<std::string> & getRoutes() = 0;
      virtual MessageType type() const noexcept = 0; 
      virtual std::variant<uint8_t, uint16_t, uint32_t> get(const std::string & attribute_name) const = 0; 

      /// Note not returning a unique_ptr but a raw pointer because the message
      // should stil have ownership of the object.
      virtual std::variant<google::protobuf::Message*,std::string> getPayload() = 0;

  };

}
#endif // MESSAGE_HPP
