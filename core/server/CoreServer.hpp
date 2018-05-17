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
#include "MsgComm.hpp"
#include "CoreIWorkerMgr.hpp"
#include "CoreXfrMgr.hpp"
#include "CoreWorker.hpp"
#include "CoreDatabaseClient.hpp"
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class Server : public IWorkerMgr
{
public:
    Server( uint32_t a_server_port, const std::string & a_cert_dir, uint32_t a_timeout, uint32_t a_num_threads, const std::string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass, const std::string & a_repo_address );
    virtual ~Server();

    Server& operator=( const Server & ) = delete;

    void    run( bool a_async );
    void    stop( bool a_wait );
    void    wait();

private:

    // IWorkerMgr methods
    const std::string & getDbURL() { return m_db_url; }
    const std::string & getDbUser() { return m_db_user; }
    const std::string & getDbPass() { return m_db_pass; }
    const std::string & getKeyPath() { return m_key_path; }
    const MsgComm::SecurityContext & getSecurityContext() { return m_sec_ctx; }
    void                authorizeClient( const std::string & a_cert_uid, const std::string & a_uid );
    void                generateKeys( const std::string & a_uid, std::string & a_key_data );
    void                getPublicKey( const std::string & a_uid, std::string & a_key_data );
    void                handleNewXfr( const XfrData & a_xfr, const std::string & a_uid );
    void                dataDelete( const std::string & a_data_id );

    void msgRouter();
    void ioSecure();
    void ioInsecure();
    void ioServices();
    void ioClients();
    void backgroundMaintenance();
    void zapHandler();

    std::string                     m_host;
    uint32_t                        m_port;
    uint32_t                        m_timeout;
    std::thread *                   m_io_secure_thread;
    std::thread *                   m_io_insecure_thread;
    std::thread *                   m_maint_thread;
    uint32_t                        m_num_threads;
    std::mutex                      m_api_mutex;
    std::mutex                      m_data_mutex;
    bool                            m_io_running;
    std::condition_variable         m_router_cvar;
    std::string                     m_cert_file;
    std::string                     m_key_file;
    std::string                     m_key_path;
    std::mutex                      m_key_mutex;
    std::string                     m_db_url;
    std::string                     m_db_user;
    std::string                     m_db_pass;
    MsgComm::SecurityContext        m_sec_ctx;
    std::string                     m_repo_address;
    std::thread *                   m_zap_thread;
    std::map<std::string,std::string>   m_auth_clients;
    std::map<std::string,std::pair<std::string,size_t>>   m_trans_auth_clients;
    std::vector<std::string>        m_data_delete;
    XfrMgr                          m_xfr_mgr;
    std::thread *                   m_msg_router_thread;
    std::vector<Worker*>            m_workers;
    size_t                          m_num_workers;
    std::thread *                   m_io_local_thread;

    friend class Session;
};


}}

#endif
