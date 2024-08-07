#ifndef STRING_MESSAGE_HPP
#define STRING_MESSAGE_HPP
#pragma once

//Local includes
#include "common/IMessage.hpp"//I need to see what I need to include
#include "common/ProtoBufMap.hpp"//This feels like it shouldnt be here???

//If we have third party includes put em here

//Standard includes
#include <list>
#include <memory>
#include <string>
#include <unordered_map>
#include <variant>


namespace SDMS{
class StringMessage : public IMessage {
public:
  StringMessage();

private:
  std::list<std::string> m_routes;
  std::string m_payload;
  MessageState m_state = MessageState::REQUEST; //Changed from std::string m_state;
  std::unordered_map<MessageAttribute, std::string> m_attributes;
  std::unordered_map<std::string, std::variant<uint8_t, uint16_t, uint32_t>> m_dyn_attributes;
  /**
   * State checkers
   **/
  
  virtual bool exists(MessageAttribute) const final; //Checking if a fixed attribute exists
  virtual bool exists(const std::string &) const final; //Checking if a dynamic attribute exists DOESNT NEED TO BE CALLED

  /**
   * Setters
   **/
  virtual void addRoute(const std::string &route) final {
    m_routes.push_back(route);
  }

  virtual void setRoutes(const std::list<std::string> &routes) final {
    m_routes = routes;
  }

  virtual void setPayload(std::variant<std::unique_ptr<::google::protobuf::Message>, std::string>) final;
  virtual void set(MessageAttribute, const std::string &) final;
  virtual void set(MessageAttribute, MessageState) final;
  virtual void set(std::string attribute_name,std::variant<uint8_t, uint16_t, uint32_t>) final;
  /**
   * Getters
   **/
  virtual std::variant<std::string, MessageState> get(MessageAttribute) const final; // Get payload as string or message state
  virtual std::variant<uint8_t, uint16_t, uint32_t> get(const std::string &attribute_name) const final;
  virtual const std::list<std::string> &getRoutes() const final {
    return m_routes;
  }
  virtual std::list<std::string> &getRoutes() final { 
    return m_routes;
  }
  virtual MessageType type() const noexcept final {
    return MessageType::STRING;
  }
  //This is saying getPayload for either google or for string that is why there is a variant
  virtual std::variant<::google::protobuf::Message *, std::string> getPayload() final;
};   


}

#endif

//NOTES:
//-Taking suggestions from GPT on structure and better ideas of whats doing what.
