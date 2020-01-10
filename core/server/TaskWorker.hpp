#ifndef TASKWORKER_HPP
#define TASKWORKER_HPP

#include <string>
#include <thread>
#include <condition_variable>
#include "CoreDatabaseClient.hpp"
#include "GlobusAPI.hpp"
#include "ITaskMgr.hpp"
#include "ITaskWorker.hpp"

namespace SDMS {
namespace Core {

class TaskWorker : public ITaskWorker
{
public:

    TaskWorker( ITaskMgr & a_mgr, uint32_t a_id );
    ~TaskWorker();

    inline uint32_t
    id()
    {
        return m_worker_id;
    }

    inline void
    sleep( std::unique_lock<std::mutex> & a_lock )
    {
        m_cvar.wait( a_lock );
    }

    inline void
    wake()
    {
        m_cvar.notify_one();
    }

private:

    void        workerThread();
    bool        handleDataGet();
    bool        handleDataPut();
    bool        handleDataChangeAlloc();
    bool        handleDataChangeOwner();
    bool        handleDataDelete();
    bool        handleAllocNew();
    bool        handleAllocDelete();
    void        getUserAccessToken( const std::string & a_uid );
    bool        checkEncryption( Encryption a_encrypt, const GlobusAPI::EndpointInfo & a_ep_info );
    void        monitorTransfer();
    bool        refreshDataSize( const std::string & a_repo_id, const std::string & a_data_id, const std::string & a_data_path, const std::string & a_src_path, const libjson::Value & a_ext );
    bool        repoSendRecv( const std::string & a_repo_id, MsgBuf::Message & a_msg, MsgBuf::Message *& a_reply );
    void        finalizeTask( bool a_succeeded, const std::string & a_msg );

    ITaskMgr &                  m_mgr;
    uint32_t                    m_worker_id;
    std::thread *               m_thread;
    std::condition_variable     m_cvar;
    ITaskMgr::Task *            m_task;
    DatabaseClient              m_db;
    GlobusAPI                   m_glob;
    std::string                 m_glob_task_id;
    std::string                 m_access_token;
};

}}

#endif
