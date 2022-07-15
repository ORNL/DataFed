#ifndef ICORESERVER_HPP
#define ICORESERVER_HPP

#include <string>

namespace SDMS {
namespace Core {

class ICoreServer
{
public:
    virtual void authenticateClient( const std::string & a_cert_uid, const std::string & a_uid ) = 0;
    virtual void metricsUpdateMsgCount( const std::string & a_uid, uint16_t a_msg_type ) = 0;
};

}}

#endif
