#ifndef IMOCKCORESERVER_HPP
#define IMOCKCORESERVER_HPP
#pragma once

// Common public libraries
#include "common/DynaLog.hpp"

// Standard includes
#include <string>

namespace SDMS {
namespace MockCore {

class IMockCoreServer {
public:
  virtual void authenticateClient(const std::string &a_cert_uid,
                                  const std::string &a_key,
                                  const std::string &a_uid,
                                  LogContext log_context) = 0;
};

} // namespace MockCore
} // namespace SDMS

#endif
