#ifndef REPOSERVER_HPP
#define REPOSERVER_HPP

#include <string>
#include <map>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <stdint.h>
#include <unistd.h>

#include "MsgBuf.hpp"
#include "MsgComm.hpp"

namespace SDMS {
namespace Repo {

class Server
{
public:
    Server( const std::string & a_cred_dir, uint32_t a_server_port, const std::string & a_core_server );
    virtual ~Server();

    Server& operator=( const Server & ) = delete;

    void        run( bool a_async );
    void        stop( bool a_wait );
    void        wait();

private:
    void        ioRun();
    void        loadKeys( const std::string & a_cred_dir );
    void        checkServerVersion();

    std::string getDataPath( const std::string & a_data_id );
    void        procStatusRequest();
    void        procVersionRequest();
    void        procDataDeleteRequest();
    void        procDataGetSizeRequest();
    void        procPathCreateRequest();
    void        procPathDeleteRequest();

    typedef void (Server::*msg_fun_t)();

    uint32_t                        m_port;
    std::string                     m_core_server;
    std::thread *                   m_io_thread;
    std::mutex                      m_api_mutex;
    std::mutex                      m_data_mutex;
    bool                            m_io_running;
    std::condition_variable         m_router_cvar;
    MsgBuf                          m_msg_buf;
    std::string                     m_pub_key;
    std::string                     m_priv_key;
    std::string                     m_core_key;

    std::map<uint16_t,msg_fun_t>    m_msg_handlers;
};


}}

#endif
