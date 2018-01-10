#ifndef SDMSCLIENT_HPP
#define SDMSCLIENT_HPP

#include <stdint.h>

namespace SDMS
{

class Client
{
public:
    Client( const std::string & a_server_host, uint32_t a_server_port );
    ~Client();

    void doSomething();

    static void startup();
    static void shutdown();

private:
    static bool m_initialized;
    std::string m_server_host;
    uint32_t    m_server_port;
};


}

#endif
