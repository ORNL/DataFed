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
    bool        cmdRawDataTransfer( libjson::Value & a_task_params );
    bool        cmdRawDataDelete( libjson::Value & a_task_params );
    bool        cmdRawDataUpdateSize( libjson::Value & a_task_params );
    bool        cmdAllocCreate( libjson::Value & a_task_params );
    bool        cmdAllocDelete( libjson::Value & a_task_params );


    void        abortTask( const std::string & a_msg );
    bool        checkEncryption( const std::string & a_ep, Encryption a_encrypt, const GlobusAPI::EndpointInfo & a_ep_info );
    //bool        refreshDataSize( const std::string & a_repo_id, const std::string & a_data_id, const std::string & a_data_path, const std::string & a_src_path, const libjson::Value & a_ext );
    bool        repoSendRecv( const std::string & a_repo_id, MsgBuf::Message & a_msg, MsgBuf::Message *& a_reply );

    ITaskMgr &                  m_mgr;
    std::thread *               m_thread;
    ITaskMgr::Task *            m_task;
    DatabaseAPI                 m_db;
    GlobusAPI                   m_glob;
};

}}

#endif
