#ifndef ZEROMQ_COMMUNICATOR_SECURE_HPP
#define ZEROMQ_COMMUNICATOR_SECURE_HPP
#pragma once

// Local private includes
#include "../Buffer.hpp"
#include "ZeroMQCommunicator.hpp"

// Local public includes
#include "ICommunicator.hpp"
#include "ICredentials.hpp"
#include "IMessage.hpp"
#include "ISocket.hpp"
#include "SocketOptions.hpp"

namespace SDMS {

  class ZeroMQCommunicatorSecure : public ZeroMQCommunicator {
    private:
      void zmqCurveSetup(const ICredentials & credentials);

    public:
      ZeroMQCommunicatorSecure(
          const SocketOptions & socket_options,
          const ICredentials & credentials,
          uint32_t timeout_on_receive_milliseconds,
          long timeout_on_poll_milliseconds);

  };

} // namespace SDMS

#endif // ZEROMQ_COMMUNICATOR_SECURE_HPP
