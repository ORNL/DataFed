#ifndef COMMUNICATOR_FACTORY_HPP
#define COMMUNICATOR_FACTORY_HPP
#pragma once

// Local includes
#include "DynaLog.hpp"
#include "ICommunicator.hpp"
#include "ICredentials.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <memory>

namespace SDMS {

class CommunicatorFactory {
private:
  LogContext m_log_context;

public:
  explicit CommunicatorFactory(const LogContext &log_context)
      : m_log_context(log_context){};

  std::unique_ptr<ICommunicator> create(const SocketOptions &socket_options,
                                        const ICredentials &credentials,
                                        uint32_t timeout_on_receive,
                                        long timeout_on_poll) const;
};

} // namespace SDMS

#endif // COMMUNICATOR_FACTORY_HPP
