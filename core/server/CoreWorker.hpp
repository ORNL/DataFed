#ifndef COREWORKER_HPP
#define COREWORKER_HPP

#include <thread>
#include <zmq.h>
#include "MsgComm.hpp"
#include "CoreDatabaseClient.hpp"

namespace SDMS {
namespace Core {

class IWorkerMgr
{
public:
    virtual const std::string & getDbURL() = 0;
    virtual const std::string & getDbUser() = 0;
    virtual const std::string & getDbPass() = 0;
};

class Worker
{
public:
    Worker( IWorkerMgr & a_mgr, size_t a_tid );
    ~Worker();

    void stop();
    void wait();

private:
    void setupMsgHandlers();
    void workerThread();
    template<typename RQ, typename RP, void (DatabaseClient::*func)( const RQ &, RP &)>
    bool dbPassThrough( const std::string & a_uid );
    bool procStatusRequest( const std::string & a_uid );
    bool procAuthenticateRequest( const std::string & a_uid );
    bool procGenerateCredentialsRequest( const std::string & a_uid );
    bool procSSH_GenerateKeysRequest( const std::string & a_uid );
    bool procSSH_GetPublicKeyRequest( const std::string & a_uid );
    bool procDataGetRequest( const std::string & a_uid );
    bool procDataPutRequest( const std::string & a_uid );
    bool procDataDeleteRequest( const std::string & a_uid );
    bool procRecordDeleteRequest( const std::string & a_uid );

    typedef bool (Worker::*msg_fun_t)( const std::string & a_uid );

    IWorkerMgr &        m_mgr;
    size_t              m_tid;
    std::thread *       m_worker_thread;
    bool                m_run;
    DatabaseClient      m_db_client;
    MsgBuf              m_msg_buf;

    //std::string         m_client_id;

    static std::map<uint16_t,msg_fun_t> m_msg_handlers;
};

}}

#endif
