#ifndef ICOMMUNICATOR_HPP
#define ICOMMUNICATOR_HPP
#pragma once

// Local includes
#include "IMessage.hpp"

// Standard includes
#include <memory>
#include <string>

namespace SDMS {

namespace constants {
namespace communicator {
const size_t MAX_COMMUNICATOR_IDENTITY_SIZE = 256;
}
}  // namespace constants

class ICommunicator {
 public:
  struct Response {
    int events = 0;
    bool time_out = false;
    bool error = false;
    std::string error_msg = "";
    std::unique_ptr<IMessage> message;
    // Again this should be changed to IMessage in the future
  };
  /**
   * Poll for incoming messages at the sockets
   *
   * Return true if a message has been provided
   * Return false if timeout and or no message
   **/
  virtual Response poll(const MessageType) = 0;

  // virtual void send(IMessage & message) = 0;

  /**
   * This is technical debt in the future get rid of MsgBuf and replace with
   * IMessage
   **/
  virtual void send(IMessage& message) = 0;

  // virtual std::unique_ptr<IMessage> receive(const MessageType type) = 0;

  /* Ideally in the future get rid of MsgBuf and replace with IMessage
   **/
  virtual Response receive(const MessageType) = 0;

  virtual const std::string id() const noexcept = 0;
  virtual const std::string address() const noexcept = 0;

  virtual ~ICommunicator(){};
};

}  // namespace SDMS

#endif  // ICOMMUNICATOR_HPP
