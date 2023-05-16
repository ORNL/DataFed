#ifndef SOCKET_FACTORY_HPP
#define SOCKET_FACTORY_HPP
#pragma once

// Local public includes
#include "ICredentials.hpp"
#include "ISocket.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <memory>

namespace SDMS {

class SocketFactory {
 public:
  std::unique_ptr<ISocket> create(const SocketOptions& socket_options,
                                  const ICredentials& credentials) const;
};

}  // namespace SDMS

#endif  // SOCKET_FACTORY_HPP
