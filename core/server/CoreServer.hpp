#ifndef CORESERVER_HPP
#define CORESERVER_HPP

#include <string>
#include <map>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <stdint.h>
#include <unistd.h>
#include <sys/types.h>
#include "Config.hpp"
#include "ICoreServer.hpp"


namespace SDMS {
namespace Core {

class ClientWorker;

class Server : public ICoreServer
{
public:
    Server();
    virtual ~Server();

    Server& operator=( const Server & ) = delete;

    void    run();

private:
    typedef std::map<std::string,std::string> auth_client_map_t;
    typedef std::map<std::string,std::pair<std::string,time_t>> trans_client_map_t;

    void waitForDB();
    void authorizeClient( const std::string & a_cert_uid, const std::string & a_uid );
    bool isClientAuthorized( const std::string & a_client_key, std::string & a_uid );
    void loadKeys( const std::string & a_cred_dir );
    void loadRepositoryConfig();
    void msgRouter();
    void ioSecure();
    void ioInsecure();
    void zapHandler();
    void dbMaintenance();

    Config &                        m_config;
    std::thread *                   m_io_secure_thread;
    std::thread *                   m_io_insecure_thread;
    std::mutex                      m_trans_client_mutex;
    bool                            m_io_running;
    std::condition_variable         m_router_cvar;
    std::string                     m_pub_key;
    std::string                     m_priv_key;
    std::thread *                   m_zap_thread;
    auth_client_map_t               m_auth_clients;
    trans_client_map_t              m_trans_auth_clients;
    std::thread *                   m_msg_router_thread;
    std::vector<ClientWorker*>      m_workers;
    std::thread *                   m_io_local_thread;
    std::thread *                   m_db_maint_thread;

    friend class Session;
};


}}

#endif
