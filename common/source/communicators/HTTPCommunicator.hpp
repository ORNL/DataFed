#ifndef HTTPCOMMUNICATOR_HPP
#define HTTPCOMMUNICATOR_HPP
#pragma once

// Fix the includes and
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/IMessage.hpp"
#include "common/ISocket.hpp"
#include "common/MessageFactory.hpp"

// Standard includes
#include <list> // Include list header
#include <memory>
#include <string>

namespace SDMS {
// This talks to the
class HTTPCommunicator : public ICommunicator {
protected:
  std::unique_ptr<ISocket> m_socket;
  LogContext m_log_context;
  uint32_t m_timeout_on_receive_milliseconds = 0;
  long m_timeout_on_poll_milliseconds = 10;
  MessageFactory m_msg_factory;
  ICommunicator::Response m_poll(uint32_t timeout_milliseconds);
  // add list obj here
  std::list<ICommunicator::Response> responseBuffer; // List to store responses
public:
  explicit HTTPCommunicator(const LogContext &log_context)
      : m_log_context(log_context){};

  // Created contructor for HTTPCommunicator
  HTTPCommunicator(const SocketOptions &socket_options,
                   const ICredentials &credentials,
                   uint32_t timeout_on_receive_milliseconds,
                   long timeout_on_poll_milliseconds,
                   const LogContext &log_context);
  virtual ICommunicator::Response poll(const MessageType) final;

  /**
   * This is technical debt in the future get rid of MsgBuf and replace with
   * IMessage
   **/
  virtual void send(IMessage &message) final;

  /* Ideally in the future get rid of MsgBuf and replace with IMessage
   **/
  virtual ICommunicator::Response receive(const MessageType) final;

  virtual const std::string id() const noexcept final;
  virtual const std::string address() const noexcept final;

  virtual ~HTTPCommunicator(){};
};

} // namespace SDMS
#endif // HTTP_HP
