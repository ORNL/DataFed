#ifndef SDMS_CLIENT_HPP
#define SDMS_CLIENT_HPP

#include <stdint.h>
#include <Connection.hpp>

namespace SDMS
{

class Client
{
public:
    Client( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout = 30 );
    ~Client();

    void hello();
    void doSomething();

    static void startup();
    static void shutdown();

private:
    static bool m_initialized;
    Connection  m_connection;
    //std::string m_server_host;
    //uint32_t    m_server_port;
    uint64_t    m_timeout;
    //void *      m_context;
    //void *      m_socket;
};


}

#endif
