#ifndef TASKWORKER_HPP
#define TASKWORKER_HPP

#include <string>
#include <thread>
#include "DatabaseAPI.hpp"
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

private:

    void        workerThread();
    bool        cmdRawDataTransfer( const libjson::Value & a_task_params );
    bool        cmdRawDataDelete( const libjson::Value & a_task_params );
    bool        cmdRawDataUpdateSize( const libjson::Value & a_task_params );
    bool        cmdAllocCreate( const libjson::Value & a_task_params );
    bool        cmdAllocDelete( const libjson::Value & a_task_params );

    bool        checkEncryption( const GlobusAPI::EndpointInfo & a_ep_info, Encryption a_encrypt );
    bool        checkEncryption( const GlobusAPI::EndpointInfo & a_ep_info1, const GlobusAPI::EndpointInfo & a_ep_info2, Encryption a_encrypt );
    bool        repoSendRecv( const std::string & a_repo_id, MsgBuf::Message & a_msg, MsgBuf::Message *& a_reply );

    ITaskMgr &                  m_mgr;
    std::thread *               m_thread;
    ITaskMgr::Task *            m_task;
    DatabaseAPI                 m_db;
    GlobusAPI                   m_glob;
};

}}

#endif
