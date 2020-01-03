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
#include "Config.hpp"
#include "CoreIWorkerMgr.hpp"
#include "CoreWorker.hpp"
#include "CoreDatabaseClient.hpp"
#include "Version.pb.h"

namespace SDMS {
namespace Core {

class Server : public IWorkerMgr
{
public:
    Server();
    virtual ~Server();

    Server& operator=( const Server & ) = delete;

    void    run( bool a_async );
    void    stop( bool a_wait );
    void    wait();

private:

    // IWorkerMgr methods
    const std::string * getRepoAddress( const std::string & a_repo_id );
    void                repoPathCreate( const std::string & a_repo_id, const std::string & a_id );
    void                repoPathDelete( const std::string & a_repo_id, const std::string & a_id );
    void                authorizeClient( const std::string & a_cert_uid, const std::string & a_uid );
    //void                handleNewXfr( const XfrData & a_xfr );
    //void                dataDelete( const std::vector<RepoRecordDataLocations> & a_locs );

    void loadKeys( const std::string & a_cred_dir );
    void loadRepositoryConfig();
    void msgRouter();
    void ioSecure();
    void ioInsecure();
    void ioServices();
    void ioClients();
    void backgroundMaintenance();
    void zapHandler();

    Config &                        m_config;
    std::thread *                   m_io_secure_thread;
    std::thread *                   m_io_insecure_thread;
    std::thread *                   m_maint_thread;
    std::mutex                      m_api_mutex;
    std::mutex                      m_data_mutex;
    bool                            m_io_running;
    std::condition_variable         m_router_cvar;
    std::string                     m_pub_key;
    std::string                     m_priv_key;
    
    //std::string                     m_repo_address;
    std::thread *                   m_zap_thread;
    std::map<std::string,std::string>   m_auth_clients;
    std::map<std::string,std::pair<std::string,size_t>>   m_trans_auth_clients;
    //std::vector<std::pair<std::string,std::string>> m_data_delete;
    std::map<std::string,std::vector<std::pair<std::string,std::string>>> m_data_delete; // repo_id -> list of record id,path
    std::vector<std::pair<std::string,std::string>> m_path_create;
    std::vector<std::pair<std::string,std::string>> m_path_delete;
    //XfrMgr                          m_xfr_mgr;
    std::thread *                   m_msg_router_thread;
    std::vector<Worker*>            m_workers;
    size_t                          m_num_workers;
    std::thread *                   m_io_local_thread;

    friend class Session;
};


}}

#endif
