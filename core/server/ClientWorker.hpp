#ifndef COREWORKER_HPP
#define COREWORKER_HPP

#include <string>
#include <vector>
#include <thread>
#include <algorithm>
#include <zmq.h>
#include <nlohmann/json.hpp>
#include <nlohmann/json-schema.hpp>
#include "Util.hpp"
#include "MsgComm.hpp"
#include "DatabaseAPI.hpp"
#include "ICoreServer.hpp"
#include "GlobusAPI.hpp"
#include <DynaLog.hpp>

namespace SDMS {
namespace Core {


class ClientWorker : public nlohmann::json_schema::basic_error_handler
{
public:
    ClientWorker( ICoreServer & a_core, size_t a_tid );
    ~ClientWorker();

    void stop();
    void wait();

private:
    void setupMsgHandlers();
    void workerThread();
    template<typename RQ, typename RP, void (DatabaseAPI::*func)( const RQ &, RP &)>
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
    bool procRecordCreateRequest( const std::string & a_uid );
    bool procRecordUpdateRequest( const std::string & a_uid );
    bool procRecordUpdateBatchRequest( const std::string & a_uid );
    bool procRecordDeleteRequest( const std::string & a_uid );
    bool procRecordAllocChangeRequest( const std::string & a_uid );
    bool procRecordOwnerChangeRequest( const std::string & a_uid );
    //bool procSearchRequest( const std::string & a_uid );
    bool procCollectionDeleteRequest( const std::string & a_uid );
    bool procProjectDeleteRequest( const std::string & a_uid );
    bool procQueryDeleteRequest( const std::string & a_uid );
    bool procProjectSearchRequest( const std::string & a_uid );
    bool procQueryCreateRequest( const std::string & a_uid );
    bool procQueryUpdateRequest( const std::string & a_uid );
    bool procRepoAllocationCreateRequest( const std::string & a_uid );
    bool procRepoAllocationDeleteRequest( const std::string & a_uid );
    bool procRepoAuthzRequest( const std::string & a_uid );
    bool procUserGetAccessTokenRequest( const std::string & a_uid );
    bool procMetadataValidateRequest( const std::string & a_uid );
    bool procSchemaCreateRequest( const std::string & a_uid );
    bool procSchemaReviseRequest( const std::string & a_uid );
    bool procSchemaUpdateRequest( const std::string & a_uid );
    void schemaEnforceRequiredProperties( const nlohmann::json & a_schema );

    void recordCollectionDelete( const std::vector<std::string> & a_ids, Auth::TaskDataReply & a_reply );
    void handleTaskResponse( libjson::Value & a_result );

    inline bool isPhrase( const std::string &str )
    {
        return find_if(str.begin(), str.end(), []( char c ){ return !isalnum(c); }) != str.end();
    }

    typedef bool (ClientWorker::*msg_fun_t)( const std::string & a_uid );

    void schemaLoader( const nlohmann::json_uri & a_uri, nlohmann::json & a_value );

    void error( const nlohmann::json_pointer<nlohmann::basic_json<>> & a_ptr, const nlohmann::json & a_inst, const std::string & a_err_msg ) override
    {
        (void) a_ptr;
        (void) a_inst;
        const std::string & path = a_ptr.to_string();

        if ( m_validator_err.size() == 0 )
            m_validator_err = "Schema Validation Error(s):\n";

        m_validator_err += "At " + (path.size()?path:"top-level") + ": " + a_err_msg + "\n";
        //std::cerr << "ERROR: '" << pointer << "' - '" << instance << "': " << message << "\n";
    }

    Config &            m_config;
    ICoreServer &       m_core;
    size_t              m_tid;
    std::thread *       m_worker_thread;
    bool                m_run;
    DatabaseAPI         m_db_client;
    MsgBuf              m_msg_buf;
    GlobusAPI           m_globus_api;
    std::string         m_validator_err;

    static std::map<uint16_t,msg_fun_t> m_msg_handlers;
};

}}

#endif
