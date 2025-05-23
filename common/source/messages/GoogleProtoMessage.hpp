#ifndef PROTOCOL_MESSAGE_HPP
#define PROTOCOL_MESSAGE_HPP
#pragma once

// Local public includes
#include "common/IMessage.hpp"
#include "common/ProtoBufMap.hpp"

// Third party includes
#include <google/protobuf/descriptor.h>
#include <google/protobuf/message.h>

// Standard includes
#include <list>
#include <memory>
#include <string>
#include <unordered_map>
#include <variant>

namespace SDMS {
/**
 * NOTES
 *
 * There is a lot of technical debt in how the MsgBuf class is implemented,
 * this needs to be addressed. The problem is that the google protobuf interface
 * is not properly encapuslated by the MsgBuf class. I.e. in the ClientWorker
 * there is a MACRO used to registere Protobuf message types to ClientWorker
 * functions, this breaks encapsulation.
 *
 * Ideally, the IMessage abstraction would fully encapsulate all things
 * google protobuf like and completely hide everything with a public facing
 * general interface. Ideally, you would also have abstraction classes for the
 * DataModel, that are independent of the underlying technology. This would
 * avoid the need to explicitly map protobuf Messages to Client worker
 * functions. This would allows you to then exapand to a different communication
 * technology hopefully with only minor writes, ideally the modularity of the
 * design would enable this.
 **/
class GoogleProtoMessage : public IMessage {
public:
  GoogleProtoMessage();

  virtual ~GoogleProtoMessage() {};
private:
  MessageState m_state = MessageState::REQUEST;

  /// List instead of vector because need to add to front, routes are small
  /// so vector cache optimization really wouldn't really make a difference
  std::list<std::string> m_routes;
  std::unordered_map<MessageAttribute, std::string> m_attributes;

  std::unordered_map<std::string, std::variant<uint8_t, uint16_t, uint32_t>>
      m_dyn_attributes;

  std::unique_ptr<::google::protobuf::Message> m_payload;

  ProtoBufMap m_proto_map;
  /**
   * State checkers
   **/
  virtual bool exists(MessageAttribute) const final;
  virtual bool exists(const std::string &) const final;

  /**
   * Setters
   **/
  virtual void addRoute(const std::string &route) final {
    m_routes.push_back(route);
  }

  virtual void setRoutes(const std::list<std::string> &routes) final {
    m_routes = routes;
  }

  virtual void setPayload(
      std::variant<std::unique_ptr<::google::protobuf::Message>, std::string>)
      final;
  virtual void set(MessageAttribute, const std::string &) final;
  virtual void set(MessageAttribute, MessageState) final;
  virtual void set(std::string attribute_name,
                   std::variant<uint8_t, uint16_t, uint32_t>) final;
  /**
   * Getters
   **/
  virtual std::variant<std::string, MessageState>
      get(MessageAttribute) const final;
  virtual std::variant<uint8_t, uint16_t, uint32_t>
  get(const std::string &attribute_name) const final;
  virtual const std::list<std::string> &getRoutes() const final {
    return m_routes;
  }
  virtual std::list<std::string> &getRoutes() final { return m_routes; }
  virtual MessageType type() const noexcept final {
    return MessageType::GOOGLE_PROTOCOL_BUFFER;
  }
  virtual std::variant<::google::protobuf::Message *, std::string>
  getPayload() final;
};

} // namespace SDMS

#endif // PROTOCOL_MESSAGE_HPP
