#ifndef MESSAGE_BUFFER_HPP
#define MESSAGE_BUFFER_HPP
#pragma once

namespace SDMS {

class MessageBuffer {
  virtual void serizalize() = 0;
  virtual void unserialize() = 0;
};

}  // namespace SDMS

#endif  // MESSAGE_BUFFER_HPP
