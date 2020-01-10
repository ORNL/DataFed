#ifndef ICORESERVER_HPP
#define ICORESERVER_HPP

#include <string>

namespace SDMS {
namespace Core {

class ICoreServer
{
public:
    virtual void authorizeClient( const std::string & a_cert_uid, const std::string & a_uid ) = 0;
};

}}

#endif
