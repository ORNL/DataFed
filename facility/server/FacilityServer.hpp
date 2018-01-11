#ifndef SDMSCLIENT_HPP
#define SDMSCLIENT_HPP

#include <stdint.h>
#include <Connection.hpp>

namespace SDMS
{

class FacilityServer
{
public:
    FacilityServer( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout = 30 );
    ~FacilityServer();

    void hello();

    static void startup();
    static void shutdown();

private:
    static bool m_initialized;
    Connection  m_connection;
    uint64_t    m_timeout;
};


}

#endif
