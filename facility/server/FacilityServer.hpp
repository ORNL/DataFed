#ifndef SDMSCLIENT_HPP
#define SDMSCLIENT_HPP

#include <thread>
#include <mutex>
#include <condition_variable>
#include <vector>

#include <stdint.h>
#include <time.h>

#include <Connection.hpp>
#include "FacilityMsgSchema.hpp"

namespace SDMS {
namespace Facility {

class Server
{
public:
    Server( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout = 30, uint32_t a_num_workers = 0 );
    ~Server();

    void    runWorkerRouter( bool a_async );
    void    stopWorkerRouter( bool a_async );
    void    waitWorkerRouter();

private:
    enum ClientState
    {
        CS_INIT,
        CS_AUTHN_PROC,
        CS_AUTHN
    };

    struct ClientInfo
    {
        ClientInfo() :
            state(CS_INIT),
            last_act(0)
        {}

        ClientState     state;
        time_t          last_act;
        // Tokens, sec context, etc
    };

    void            workerRouter();
    ClientInfo &    getClientInfo( Connection::MsgBuffer &a_msg_buffer, bool a_upd_last_act = false );

    class Worker
    {
    public:
        Worker( Server &a_server, void *a_context, int a_id );
        ~Worker();

        void    workerThread();
        void    join();
        void    procMsgPing( Connection::MsgBuffer &a_msg_buffer );
        void    procMsgLogin( Connection::MsgBuffer &a_msg_buffer );

        typedef void (Server::Worker::*msg_fun_t)( Connection::MsgBuffer& );

        Server  &           m_server;
        void            *   m_context;
        Connection      *   m_conn;
        std::thread   *     m_worker_thread;
        int                 m_id;
        static msg_fun_t    m_proc_funcs[_FMT_END];
    };

    Connection                      m_connection;
    uint64_t                        m_timeout;
    std::thread   *                 m_router_thread;
    uint32_t                        m_num_workers;
    std::vector<Worker*>            m_workers;
    std::mutex                      m_api_mutex;
    std::mutex                      m_data_mutex;
    bool                            m_router_running;
    bool                            m_worker_running;
    std::condition_variable         m_router_cvar;
    std::map<uint32_t,ClientInfo>   m_client_info;
};


}}

#endif
