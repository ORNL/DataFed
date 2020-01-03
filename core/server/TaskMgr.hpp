#ifndef TASKMGR_HPP
#define TASKMGR_HPP

#include <string>
#include <vector>
#include <deque>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <libjson.hpp>

#include "Config.hpp"
#include "CoreDatabaseClient.hpp"
#include "GlobusAPI.hpp"
#include "SDMS_Auth.pb.h"
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class TaskMgr
{
public:
    static TaskMgr & getInstance();

    void    newTask( libjson::Value & a_task );
    void    cancelTask( const std::string & a_task_id );

    //void    transferData( XfrDataReply );
    //void    putData( const std::string& a_id, const std::string & a_path, XfrEncrypt a_encrypt, const std::string * a_ext = 0 );
    //void    moveData( const std::vector<std::string> & a_ids, const std::string & a_repo, XfrEncrypt a_encrypt );
    //void    deleteData( const std::vector<std::string> & a_ids );

private:
    struct Worker
    {
        Worker( uint32_t a_id ) :
            worker_id( a_id ), thread( 0 ), next( 0 ),
            db( Config::getInstance().db_url , Config::getInstance().db_user, Config::getInstance().db_pass )
        {}

        uint32_t                    worker_id;
        std::thread *               thread;
        std::condition_variable     cvar;
        Worker *                    next;
        DatabaseClient              db;
        GlobusAPI                   glob;
        std::string                 glob_task_id;
        std::string                 access_token;
    };

    struct Task
    {
        Task( const std::string & a_id, libjson::Value & a_data ) :
            task_id( a_id ), data( std::move( a_data )), cancel(false)
        {}

        ~Task()
        {}

        std::string                 task_id;
        libjson::Value              data;
        bool                        cancel;
    };


    typedef std::vector<std::pair<std::string,std::string>> url_params_t;

    TaskMgr();
    ~TaskMgr();

    void        mainThread();
    void        workerThread( Worker * worker );
    void        handleDataGet( Worker *worker, Task * task );
    void        handleDataPut( Worker *worker, Task * task );
    void        handleDataChangeAlloc( Worker *worker, Task * task );
    void        handleDataChangeOwner( Worker *worker, Task * task );
    void        handleDataDelete( Worker *worker, Task * task );

    //void        httpInit( TaskInfo & a_task, bool a_post, const std::string & a_url_base, const std::string & a_url_path, const std::string & a_token, const url_params_t & a_params, const rapidjson::Document * a_body )

    Task *      getNextTask();
    void        finalizeTask( DatabaseClient & a_db_client, Task * a_task, bool a_succeeded, const std::string & a_msg );
    void        getUserAccessToken( Worker * a_worker, const std::string & a_uid );
    bool        checkEncryption( Encryption a_encrypt, const GlobusAPI::EndpointInfo & a_ep_info );
    void        monitorTransfer( Worker *worker );
    void        refreshDataSize( Worker * a_worker, const std::string & a_repo_id, const std::string & a_data_id, const std::string & a_data_path, const std::string & a_src_path, const libjson::Value & a_ext );

    Config &                    m_config;
    std::deque<Task*>           m_tasks_ready;
    std::map<std::string,Task*> m_tasks_running;
    std::mutex                  m_worker_mutex;
    std::vector<Worker*>        m_workers;
    Worker *                    m_worker_next;
    std::thread *               m_main_thread;
};

}}

#endif
