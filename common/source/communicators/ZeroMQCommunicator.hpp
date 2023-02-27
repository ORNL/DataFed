#ifndef ZEROMQ_COMMUNICATOR_HPP
#define ZEROMQ_COMMUNICATOR_HPP
#pragma once

// Local private includes
#include "../Buffer.hpp"

// Local public includes
#include "ICommunicator.hpp"
#include "IMessage.hpp"
#include "ISocket.hpp"
#include "MessageFactory.hpp"
#include "ProtoBufFactory.hpp"

// Third party includes
#include <zmq.hpp>

// Standard includes
#include <memory>
#include <string>

namespace SDMS {

  class ZeroMQCommunicator : public ICommunicator {
    private:
      std::unique_ptr<ISocket> m_socket;
      uint16_t m_zmq_context;
      void * m_zmq_socket = nullptr;
      int m_zmq_socket_type;
      void * m_zmq_ctx = nullptr;
      /// Optional timeout in milliseconds (0 = wait forever)
      uint32_t m_timeout_on_receive_milliseconds = 0;
      long m_timeout_on_poll_milliseconds = 10; 
      MessageFactory m_msg_factory;
      Buffer m_buffer;
      ProtoBufFactory m_protocol_factory;
      ICommunicator::Response m_poll(uint32_t timeout_milliseconds);

    public:
      ZeroMQCommunicator(
          const SocketOptions & socket_options,
          const ICredentials & credentials,
          uint32_t timeout_on_receive_milliseconds,
          long timeout_on_poll_milliseconds);

      /**
       * Poll for incoming messages at the sockets
       *
       * Return true if a message(s) has been provided
       * Return false if timeout and or no message
       **/
      virtual ICommunicator::Response poll(const MessageType) final;

      virtual void send(IMessage & message) final;
      virtual ICommunicator::Response receive(const MessageType) final;

      virtual const std::string id() const noexcept final;
  };

} // namespace SDMS

#endif // ZEROMQ_COMMUNICATOR_HPP
