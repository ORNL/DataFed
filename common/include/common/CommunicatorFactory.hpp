#ifndef COMMUNICATOR_FACTORY_HPP
#define COMMUNICATOR_FACTORY_HPP
#pragma once

// Local includes
#include "ICredentials.hpp"
#include "ICommunicator.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <memory>

namespace SDMS {

class CommunicatorFactory {
  public:
    std::unique_ptr<ICommunicator> create(
        const SocketOptions & socket_options,
        const ICredentials & credentials,
        uint32_t timeout_on_receive,
        long timeout_on_poll) const;
};

} // namespace SDMS

#endif // COMMUNICATOR_FACTORY_HPP
