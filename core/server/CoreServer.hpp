#ifndef CORESERVER_HPP
#define CORESERVER_HPP

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
#//include <asio.hpp>
//#include <asio/ssl.hpp>

#include "MsgComm.hpp"
//#include "CoreSession.hpp"
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
    struct XfrDataInfo
    {
        XfrDataInfo( const XfrData & a_xfr, const std::string & a_uid ) :
            id(a_xfr.id()),mode(a_xfr.mode()),status(a_xfr.status()),data_id(a_xfr.data_id()),repo_path(a_xfr.repo_path()),
            local_path(a_xfr.local_path()),uid(a_uid),stage(0),poll(0),backoff(0)
        {
            if ( a_xfr.has_task_id() )
                task_id = a_xfr.task_id();
        }

        std::string     id;
        XfrMode         mode;
        XfrStatus       status;
        std::string     data_id;
        std::string     repo_path;
        std::string     local_path;
        std::string     task_id;
        std::string     uid;
        int             stage; // (0=not started,1=started,2=active)
        int             poll;
        int             backoff;
    };

    // ISessionMgr methods
    /*
    void                sessionClosed( spSession );
    const std::string & getCertFile() { return m_cert_file; }
    const std::string & getKeyFile() { return m_key_file; }
    */

    // IWorkerMgr methods
    const std::string & getDbURL() { return m_db_url; };
    const std::string & getDbUser() { return m_db_user; };
    const std::string & getDbPass() { return m_db_pass; };
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
    //void ioRun();
    //void accept();
    void backgroundMaintenance();
    void xfrManagement();
    bool parseGlobusEvents( const std::string & a_events, XfrStatus & status, std::string & a_err_msg );
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
    //asio::io_service                m_io_service;
    //asio::ip::tcp::endpoint         m_endpoint;
    //asio::ip::tcp::acceptor         m_acceptor;
    //asio::ssl::context              m_context;
    //std::set<spSession>             m_sessions;
    std::string                     m_cert_file;
    std::string                     m_key_file;
    std::string                     m_key_path;
    std::mutex                      m_key_mutex;
    std::mutex                      m_xfr_mutex;
    std::deque<std::string>         m_xfr_pending;
    std::list<XfrDataInfo*>         m_xfr_active;
    std::map<std::string,XfrDataInfo*>   m_xfr_all;
    std::thread *                   m_xfr_thread;

    std::string                     m_db_url;
    std::string                     m_db_user;
    std::string                     m_db_pass;
    MsgComm::SecurityContext        m_sec_ctx;
    std::string                     m_repo_address;
    std::thread *                   m_zap_thread;
    std::map<std::string,std::string>   m_auth_clients;
    std::map<std::string,std::pair<std::string,size_t>>   m_trans_auth_clients;
    std::vector<std::string>        m_data_delete;

    std::thread *                   m_msg_router_thread;
    std::vector<Worker*>            m_workers;
    size_t                          m_num_workers;
    std::thread *                   m_io_local_thread;

    friend class Session;
};


}}

#endif
