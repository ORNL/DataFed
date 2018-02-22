#ifndef FACILITYSERVER_HPP
#define FACILITYSERVER_HPP

#include <string>

namespace SDMS {
namespace Facility {

class ServerImpl;

class Server
{
public:
    Server( uint32_t a_server_port, const std::string & a_verify_path, uint32_t a_timeout = 30, uint32_t a_num_threads = 0 );
    ~Server();

    Server& operator=( const Server & ) = delete;

    void    run( bool a_async );
    void    stop( bool a_wait );
    void    wait();

private:
    ServerImpl *    m_impl;
};


}}

#endif
