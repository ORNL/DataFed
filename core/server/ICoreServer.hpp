#ifndef ICORESERVER_HPP
#define ICORESERVER_HPP
#pragma once

// Common public libraries
#include "common/DynaLog.hpp"

// Standard includes
#include <string>

namespace SDMS {
namespace Core {

class ICoreServer
{
public:
    virtual void authenticateClient( const std::string & a_cert_uid, const std::string & a_key, const std::string & a_uid, LogContext log_context ) = 0;
    virtual void metricsUpdateMsgCount( const std::string & a_uid, uint16_t a_msg_type ) = 0;
};

}}

#endif
