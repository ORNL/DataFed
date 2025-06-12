#ifndef ZEROMQ_COMMUNICATOR_SECURE_HPP
#define ZEROMQ_COMMUNICATOR_SECURE_HPP
#pragma once

// Local private includes
#include "../Buffer.hpp"
#include "ZeroMQCommunicator.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/ICredentials.hpp"
#include "common/IMessage.hpp"
#include "common/ISocket.hpp"
#include "common/SocketOptions.hpp"

namespace SDMS {

class ZeroMQCommunicatorSecure : public ZeroMQCommunicator {
private:
  void zmqCurveSetup(const ICredentials &credentials);
  LogContext m_log_context;

public:
  virtual ~ZeroMQCommunicatorSecure() {};

  ZeroMQCommunicatorSecure(const SocketOptions &socket_options,
                           const ICredentials &credentials,
                           uint32_t timeout_on_receive_milliseconds,
                           long timeout_on_poll_milliseconds,
                           LogContext log_context);
};

} // namespace SDMS

#endif // ZEROMQ_COMMUNICATOR_SECURE_HPP
