#ifndef REPOSERVER_HPP
#define REPOSERVER_HPP

#include <string>
#include <map>
#include <set>
#include <deque>
#include <list>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <stdint.h>
#include <unistd.h>
#include <sys/types.h>
#include <asio.hpp>
#include <asio/ssl.hpp>

#include "RepoSession.hpp"
#include "SDMS.pb.h"

namespace SDMS {
namespace Repo {

class Server : public ISessionMgr
{
public:
    Server( uint32_t a_server_port, const std::string & a_cert_dir, uint32_t a_num_threads );
    virtual ~Server();

    Server& operator=( const Server & ) = delete;

    void            run( bool a_async );
    void            stop( bool a_wait );
    void            wait();

private:
    void            ioRun();
    void            accept();
    void            backgroundMaintenance();

    // ISessionMgr methods
    void            sessionClosed( spSession );
    std::string     getDataPath( const std::string & a_data_id );

    std::string                     m_host;
    uint32_t                        m_port;
    std::thread *                   m_io_thread;
    uint32_t                        m_num_threads;
    std::mutex                      m_api_mutex;
    std::mutex                      m_data_mutex;
    bool                            m_io_running;
    std::condition_variable         m_router_cvar;
    asio::io_service                m_io_service;
    asio::ip::tcp::endpoint         m_endpoint;
    asio::ip::tcp::acceptor         m_acceptor;
    asio::ssl::context              m_context;
    std::set<spSession>             m_sessions;
    std::string                     m_cert_file;
    std::string                     m_key_file;

    friend class Session;
};


}}

#endif
