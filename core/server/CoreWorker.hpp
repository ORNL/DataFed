#ifndef COREWORKER_HPP
#define COREWORKER_HPP

#include <string>
#include <vector>
#include <thread>
#include <algorithm>
#include <zmq.h>
#include "MsgComm.hpp"
#include "CoreDatabaseClient.hpp"
#include "CoreIWorkerMgr.hpp"

namespace SDMS {
namespace Core {


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
    bool procGetAuthStatusRequest( const std::string & a_uid );
    bool procStatusRequest( const std::string & a_uid );
    bool procVersionRequest( const std::string & a_uid );
    bool procAuthenticateByPasswordRequest( const std::string & a_uid );
    bool procAuthenticateByTokenRequest( const std::string & a_uid );
    bool procGenerateCredentialsRequest( const std::string & a_uid );
    bool procRevokeCredentialsRequest( const std::string & a_uid );
    bool procDataGetRequest( const std::string & a_uid );
    bool procDataPutRequest( const std::string & a_uid );
    bool procDataCopyRequest( const std::string & a_uid );
    bool procDataDeleteRequest( const std::string & a_uid );
    bool procRecordUpdateRequest( const std::string & a_uid );
    bool procRecordUpdateBatchRequest( const std::string & a_uid );
    bool procRecordDeleteRequest( const std::string & a_uid );
    bool procCollectionDeleteRequest( const std::string & a_uid );
    bool procProjectDeleteRequest( const std::string & a_uid );
    bool procQueryDeleteRequest( const std::string & a_uid );
    bool procRecordSearchRequest( const std::string & a_uid );
    bool procProjectSearchRequest( const std::string & a_uid );
    bool procQueryCreateRequest( const std::string & a_uid );
    bool procQueryUpdateRequest( const std::string & a_uid );
    bool procRepoAllocationSetRequest( const std::string & a_uid );
    bool procRepoAuthzRequest( const std::string & a_uid );

    inline bool isPhrase( const std::string &str )
    {
        return find_if(str.begin(), str.end(), []( char c ){ return !isalnum(c); }) != str.end();
    }

    std::string parseSearchTerms( const std::string & a_key, const std::vector<std::string> & a_terms );
    std::string parseSearchPhrase( const char * key, const std::string & a_phrase );
    std::string parseSearchTextPhrase( const std::string & a_phrase );
    std::string parseSearchIdAlias( const std::string & a_query );
    std::string parseSearchMetadata( const std::string & a_query );
    std::string parseQuery( const std::string & a_query, bool & use_client, bool & use_shared_users, bool & use_shared_projects );
    std::string parseProjectQuery( const std::string & a_text_query, const std::vector<std::string> & a_scope );

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
