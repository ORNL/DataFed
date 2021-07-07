#include <iostream>
#include <atomic>
#include <boost/tokenizer.hpp>
#include <ClientWorker.hpp>
#include <TraceException.hpp>
#include <Util.hpp>
#include <Version.pb.h>
#include <SDMS.pb.h>
#include <SDMS_Anon.pb.h>
#include <SDMS_Auth.pb.h>
#include "TaskMgr.hpp"
#include "libjson.hpp"

using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace Core {


map<uint16_t,ClientWorker::msg_fun_t> ClientWorker::m_msg_handlers;

// TODO - This should be defined in proto files
#define NOTE_MASK_MD_ERR 0x2000

ClientWorker::ClientWorker( ICoreServer & a_core, size_t a_tid ) :
    m_config(Config::getInstance()), m_core(a_core), m_tid(a_tid), m_worker_thread(0), m_run(true),
    m_db_client( m_config.db_url , m_config.db_user, m_config.db_pass )
{
    setupMsgHandlers();
    m_worker_thread = new thread( &ClientWorker::workerThread, this );
}

ClientWorker::~ClientWorker()
{
    stop();
    wait();
}

void
ClientWorker::stop()
{
    m_run = false;
}

void
ClientWorker::wait()
{
    if ( m_worker_thread )
    {
        m_worker_thread->join();
        delete m_worker_thread;
        m_worker_thread = 0;
    }
}

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[MsgBuf::findMessageType( proto_id, #msg )] = func
#define SET_MSG_HANDLER_DB(proto_id,rq,rp,func) m_msg_handlers[MsgBuf::findMessageType( proto_id, #rq )] = &ClientWorker::dbPassThrough<rq,rp,&DatabaseAPI::func>

/**
 * This method configures message handling by creating a map from message type to handler function.
 * There are currently two protocol levels: anonymous and authenticated. Each is supported by a
 * Google protobuf interface (in /common/proto). Most requests can be handled directly by the
 * DB (via DatabaseAPI class), but some require local processing. This method maps the two classes
 * of requests using the macros SET_MSG_HANDLER (for local) and SET_MSG_HANDLER_DB (for DB only).
 */
void
ClientWorker::setupMsgHandlers()
{
    static std::atomic_flag lock = ATOMIC_FLAG_INIT;

    // Only perform the processing once as it affects global state in the messaging libraries
    if ( lock.test_and_set() )
        return;

    try
    {
        // Register and setup handlers for the Anonymous interface

        uint8_t proto_id = REG_PROTO( SDMS::Anon );

        // Requests that require the server to take action
        SET_MSG_HANDLER( proto_id, VersionRequest, &ClientWorker::procVersionRequest );
        SET_MSG_HANDLER( proto_id, AuthenticateByPasswordRequest, &ClientWorker::procAuthenticateByPasswordRequest );
        SET_MSG_HANDLER( proto_id, AuthenticateByTokenRequest, &ClientWorker::procAuthenticateByTokenRequest );
        SET_MSG_HANDLER( proto_id, GetAuthStatusRequest, &ClientWorker::procGetAuthStatusRequest );


        // Register and setup handlers for the Authenticated interface

        proto_id = REG_PROTO( SDMS::Auth );

        // Requests that require the server to take action
        SET_MSG_HANDLER( proto_id, GenerateCredentialsRequest, &ClientWorker::procGenerateCredentialsRequest );
        SET_MSG_HANDLER( proto_id, RevokeCredentialsRequest, &ClientWorker::procRevokeCredentialsRequest );
        SET_MSG_HANDLER( proto_id, DataGetRequest, &ClientWorker::procDataGetRequest );
        SET_MSG_HANDLER( proto_id, DataPutRequest, &ClientWorker::procDataPutRequest );
        SET_MSG_HANDLER( proto_id, RecordCreateRequest, &ClientWorker::procRecordCreateRequest );
        SET_MSG_HANDLER( proto_id, RecordUpdateRequest, &ClientWorker::procRecordUpdateRequest );
        SET_MSG_HANDLER( proto_id, RecordUpdateBatchRequest, &ClientWorker::procRecordUpdateBatchRequest );
        SET_MSG_HANDLER( proto_id, RecordDeleteRequest, &ClientWorker::procRecordDeleteRequest );
        SET_MSG_HANDLER( proto_id, RecordAllocChangeRequest, &ClientWorker::procRecordAllocChangeRequest );
        SET_MSG_HANDLER( proto_id, RecordOwnerChangeRequest, &ClientWorker::procRecordOwnerChangeRequest );
        SET_MSG_HANDLER( proto_id, ProjectSearchRequest, &ClientWorker::procProjectSearchRequest );
        SET_MSG_HANDLER( proto_id, CollDeleteRequest, &ClientWorker::procCollectionDeleteRequest );
        SET_MSG_HANDLER( proto_id, ProjectDeleteRequest, &ClientWorker::procProjectDeleteRequest );
        SET_MSG_HANDLER( proto_id, RepoAuthzRequest, &ClientWorker::procRepoAuthzRequest );
        SET_MSG_HANDLER( proto_id, RepoAllocationCreateRequest, &ClientWorker::procRepoAllocationCreateRequest );
        SET_MSG_HANDLER( proto_id, RepoAllocationDeleteRequest, &ClientWorker::procRepoAllocationDeleteRequest );
        SET_MSG_HANDLER( proto_id, UserGetAccessTokenRequest, &ClientWorker::procUserGetAccessTokenRequest );
        SET_MSG_HANDLER( proto_id, SchemaCreateRequest, &ClientWorker::procSchemaCreateRequest );
        SET_MSG_HANDLER( proto_id, SchemaReviseRequest, &ClientWorker::procSchemaReviseRequest );
        SET_MSG_HANDLER( proto_id, SchemaUpdateRequest, &ClientWorker::procSchemaUpdateRequest );
        SET_MSG_HANDLER( proto_id, MetadataValidateRequest, &ClientWorker::procMetadataValidateRequest );

        // Requests that can be handled by DB client directly
        SET_MSG_HANDLER_DB( proto_id, CheckPermsRequest, CheckPermsReply, checkPerms );
        SET_MSG_HANDLER_DB( proto_id, GetPermsRequest, GetPermsReply, getPerms );
        SET_MSG_HANDLER_DB( proto_id, UserViewRequest, UserDataReply, userView );
        SET_MSG_HANDLER_DB( proto_id, UserSetAccessTokenRequest, AckReply, userSetAccessToken );
        SET_MSG_HANDLER_DB( proto_id, UserCreateRequest, UserDataReply, userCreate );
        SET_MSG_HANDLER_DB( proto_id, UserUpdateRequest, UserDataReply, userUpdate );
        SET_MSG_HANDLER_DB( proto_id, UserListAllRequest, UserDataReply, userListAll );
        SET_MSG_HANDLER_DB( proto_id, UserListCollabRequest, UserDataReply, userListCollab );
        SET_MSG_HANDLER_DB( proto_id, UserFindByUUIDsRequest, UserDataReply, userFindByUUIDs );
        SET_MSG_HANDLER_DB( proto_id, UserFindByNameUIDRequest, UserDataReply, userFindByNameUID );
        SET_MSG_HANDLER_DB( proto_id, UserGetRecentEPRequest, UserGetRecentEPReply, userGetRecentEP );
        SET_MSG_HANDLER_DB( proto_id, UserSetRecentEPRequest, AckReply, userSetRecentEP );
        SET_MSG_HANDLER_DB( proto_id, ProjectViewRequest, ProjectDataReply, projView );
        SET_MSG_HANDLER_DB( proto_id, ProjectCreateRequest, ProjectDataReply, projCreate );
        SET_MSG_HANDLER_DB( proto_id, ProjectUpdateRequest, ProjectDataReply, projUpdate );
        SET_MSG_HANDLER_DB( proto_id, ProjectListRequest, ListingReply, projList );
        SET_MSG_HANDLER_DB( proto_id, ProjectGetRoleRequest, ProjectGetRoleReply, projGetRole );
        SET_MSG_HANDLER_DB( proto_id, RecordViewRequest, RecordDataReply, recordView );
        SET_MSG_HANDLER_DB( proto_id, RecordCreateBatchRequest, RecordDataReply, recordCreateBatch );
        SET_MSG_HANDLER_DB( proto_id, RecordExportRequest, RecordExportReply, recordExport );
        SET_MSG_HANDLER_DB( proto_id, RecordLockRequest, ListingReply, recordLock );
        SET_MSG_HANDLER_DB( proto_id, RecordListByAllocRequest, ListingReply, recordListByAlloc );
        SET_MSG_HANDLER_DB( proto_id, RecordGetDependencyGraphRequest, ListingReply, recordGetDependencyGraph );
        SET_MSG_HANDLER_DB( proto_id, SearchRequest, ListingReply, generalSearch );
        SET_MSG_HANDLER_DB( proto_id, DataPathRequest, DataPathReply, dataPath );
        SET_MSG_HANDLER_DB( proto_id, CollViewRequest, CollDataReply, collView );
        SET_MSG_HANDLER_DB( proto_id, CollReadRequest, ListingReply, collRead );
        SET_MSG_HANDLER_DB( proto_id, CollListPublishedRequest, ListingReply, collListPublished );
        SET_MSG_HANDLER_DB( proto_id, CollCreateRequest, CollDataReply, collCreate );
        SET_MSG_HANDLER_DB( proto_id, CollUpdateRequest, CollDataReply, collUpdate );
        SET_MSG_HANDLER_DB( proto_id, CollWriteRequest, ListingReply, collWrite );
        SET_MSG_HANDLER_DB( proto_id, CollMoveRequest, AckReply, collMove );
        SET_MSG_HANDLER_DB( proto_id, CollGetParentsRequest, CollPathReply, collGetParents );
        SET_MSG_HANDLER_DB( proto_id, CollGetOffsetRequest, CollGetOffsetReply, collGetOffset );
        SET_MSG_HANDLER_DB( proto_id, QueryListRequest, ListingReply, queryList );
        SET_MSG_HANDLER_DB( proto_id, QueryViewRequest, QueryDataReply, queryView );
        SET_MSG_HANDLER_DB( proto_id, QueryExecRequest, ListingReply, queryExec );
        SET_MSG_HANDLER_DB( proto_id, QueryCreateRequest, QueryDataReply, queryCreate );
        SET_MSG_HANDLER_DB( proto_id, QueryUpdateRequest, QueryDataReply, queryUpdate );
        SET_MSG_HANDLER_DB( proto_id, QueryDeleteRequest, AckReply, queryDelete );
        SET_MSG_HANDLER_DB( proto_id, AnnotationViewRequest, AnnotationDataReply, annotationView );
        SET_MSG_HANDLER_DB( proto_id, AnnotationListBySubjectRequest, AnnotationDataReply, annotationListBySubject );
        SET_MSG_HANDLER_DB( proto_id, AnnotationCreateRequest, AnnotationDataReply, annotationCreate );
        SET_MSG_HANDLER_DB( proto_id, AnnotationUpdateRequest, AnnotationDataReply, annotationUpdate );
        SET_MSG_HANDLER_DB( proto_id, AnnotationCommentEditRequest, AnnotationDataReply, annotationCommentEdit );
        SET_MSG_HANDLER_DB( proto_id, TaskListRequest, TaskDataReply, taskList );
        SET_MSG_HANDLER_DB( proto_id, TaskViewRequest, TaskDataReply, taskView );
        SET_MSG_HANDLER_DB( proto_id, ACLViewRequest, ACLDataReply, aclView );
        SET_MSG_HANDLER_DB( proto_id, ACLUpdateRequest, ACLDataReply, aclUpdate );
        SET_MSG_HANDLER_DB( proto_id, ACLSharedListRequest, ListingReply, aclSharedList );
        SET_MSG_HANDLER_DB( proto_id, ACLSharedListItemsRequest, ListingReply, aclSharedListItems );
        //SET_MSG_HANDLER_DB( proto_id, ACLBySubjectRequest, ListingReply, aclBySubject );
        //SET_MSG_HANDLER_DB( proto_id, ACLListItemsBySubjectRequest, ListingReply, aclListItemsBySubject );
        SET_MSG_HANDLER_DB( proto_id, GroupCreateRequest, GroupDataReply, groupCreate );
        SET_MSG_HANDLER_DB( proto_id, GroupUpdateRequest, GroupDataReply, groupUpdate );
        SET_MSG_HANDLER_DB( proto_id, GroupDeleteRequest, AckReply, groupDelete );
        SET_MSG_HANDLER_DB( proto_id, GroupListRequest, GroupDataReply, groupList );
        SET_MSG_HANDLER_DB( proto_id, GroupViewRequest, GroupDataReply, groupView );
        SET_MSG_HANDLER_DB( proto_id, RepoListRequest, RepoDataReply, repoList );
        SET_MSG_HANDLER_DB( proto_id, RepoViewRequest, RepoDataReply, repoView );
        SET_MSG_HANDLER_DB( proto_id, RepoCreateRequest, RepoDataReply, repoCreate );
        SET_MSG_HANDLER_DB( proto_id, RepoUpdateRequest, RepoDataReply, repoUpdate );
        SET_MSG_HANDLER_DB( proto_id, RepoDeleteRequest, AckReply, repoDelete );
        SET_MSG_HANDLER_DB( proto_id, RepoCalcSizeRequest, RepoCalcSizeReply, repoCalcSize );
        SET_MSG_HANDLER_DB( proto_id, RepoListAllocationsRequest, RepoAllocationsReply, repoListAllocations );
        SET_MSG_HANDLER_DB( proto_id, RepoListSubjectAllocationsRequest, RepoAllocationsReply, repoListSubjectAllocations );
        SET_MSG_HANDLER_DB( proto_id, RepoListObjectAllocationsRequest, RepoAllocationsReply, repoListObjectAllocations );
        SET_MSG_HANDLER_DB( proto_id, RepoViewAllocationRequest, RepoAllocationsReply, repoViewAllocation );
        SET_MSG_HANDLER_DB( proto_id, RepoAllocationSetRequest, AckReply, repoAllocationSet );
        SET_MSG_HANDLER_DB( proto_id, RepoAllocationSetDefaultRequest, AckReply, repoAllocationSetDefault );
        SET_MSG_HANDLER_DB( proto_id, RepoAllocationStatsRequest, RepoAllocationStatsReply, repoAllocationStats );
        SET_MSG_HANDLER_DB( proto_id, SchemaSearchRequest, SchemaDataReply, schemaSearch );
        SET_MSG_HANDLER_DB( proto_id, SchemaViewRequest, SchemaDataReply, schemaView );
        SET_MSG_HANDLER_DB( proto_id, SchemaDeleteRequest, AckReply, schemaDelete );
        SET_MSG_HANDLER_DB( proto_id, TagSearchRequest, TagDataReply, tagSearch );
        SET_MSG_HANDLER_DB( proto_id, TagListByCountRequest, TagDataReply, tagListByCount );
        SET_MSG_HANDLER_DB( proto_id, TopicListTopicsRequest, TopicDataReply, topicListTopics );
        SET_MSG_HANDLER_DB( proto_id, TopicViewRequest, TopicDataReply, topicView );
        SET_MSG_HANDLER_DB( proto_id, TopicSearchRequest, TopicDataReply, topicSearch );
    }
    catch( TraceException & e)
    {
        DL_ERROR( "ClientWorker::setupMsgHandlers, exception: " << e.toString() );
        throw;
    }
}

/**
 * ClientWorker message handling thread.
 */
void
ClientWorker::workerThread()
{
    DL_DEBUG( "W" << m_tid << " thread started" );

    MsgComm         comm( "inproc://workers", MsgComm::DEALER, false );
    uint16_t        msg_type;
    map<uint16_t,msg_fun_t>::iterator handler;

    uint16_t task_list_msg_type = MsgBuf::findMessageType( 2, "TaskListRequest" );

    Anon::NackReply nack;
    nack.set_err_code( ID_AUTHN_REQUIRED );
    nack.set_err_msg( "Authentication required" );

    //int delay;

    while ( m_run )
    {
        try
        {
            if ( comm.recv( m_msg_buf, true, 1000 ))
            {
                msg_type = m_msg_buf.getMsgType();

                // DEBUG - Inject random delay in message processing
                /*delay = (rand() % 2000)*1000;
                if ( delay )
                {
                    usleep( delay );
                }*/

                if ( msg_type != task_list_msg_type )
                {
                    DL_DEBUG( "W" << m_tid << " msg " << msg_type << " ["<< m_msg_buf.getUID() <<"]" );
                }

                if ( strncmp( m_msg_buf.getUID().c_str(), "anon_", 5 ) == 0 && msg_type > 0x1FF )
                {
                    DL_WARN( "W" << m_tid << " unauthorized access attempt from anon user" );
                    m_msg_buf.serialize( nack );
                    comm.send( m_msg_buf );
                }
                else
                {
                    handler = m_msg_handlers.find( msg_type );
                    if ( handler != m_msg_handlers.end() )
                    {
                        //DL_TRACE( "W"<<m_tid<<" calling handler" );

                        if ( (this->*handler->second)( m_msg_buf.getUID() ))
                        {
                            comm.send( m_msg_buf );
                            /*if ( msg_type != task_list_msg_type )
                            {
                                DL_DEBUG( "W"<<m_tid<<" reply sent." );
                            }*/
                        }
                    }
                    else
                        DL_ERROR( "W" << m_tid << " recvd unregistered msg: " << msg_type );
                }
            }
        }
        catch( TraceException & e )
        {
            DL_ERROR( "W" << m_tid << " " << e.toString() );
        }
        catch( exception & e )
        {
            DL_ERROR( "W" << m_tid << " " << e.what() );
        }
        catch( ... )
        {
            DL_ERROR( "W" << m_tid << " unknown exception type" );
        }
    }
}

// TODO The macros below should be replaced with templates

/// This macro defines the begining of the common message handling code for all local handlers

#define PROC_MSG_BEGIN( msgclass, replyclass ) \
msgclass *request = 0; \
bool send_reply = true; \
::google::protobuf::Message *base_msg = m_msg_buf.unserialize(); \
if ( base_msg ) \
{ \
    request = dynamic_cast<msgclass*>( base_msg ); \
    if ( request ) \
    { \
        DL_TRACE( "Rcvd [" << request->DebugString() << "]"); \
        replyclass reply; \
        try \
        {

/// This macro defines the end of the common message handling code for all local handlers

#define PROC_MSG_END \
            if ( send_reply ) \
                m_msg_buf.serialize( reply ); \
        } \
        catch( TraceException &e ) \
        { \
            DL_ERROR( "W"<<m_tid<<" " << e.toString() ); \
            if ( send_reply ) { \
                NackReply nack; \
                nack.set_err_code( (ErrorCode) e.getErrorCode() ); \
                nack.set_err_msg( e.toString( true ) ); \
                m_msg_buf.serialize( nack ); }\
        } \
        catch( exception &e ) \
        { \
            DL_ERROR( "W"<<m_tid<<" " << e.what() ); \
            if ( send_reply ) { \
                NackReply nack; \
                nack.set_err_code( ID_INTERNAL_ERROR ); \
                nack.set_err_msg( e.what() ); \
                m_msg_buf.serialize( nack ); } \
        } \
        catch(...) \
        { \
            DL_ERROR( "W"<<m_tid<<" unkown exception while processing message!" ); \
            if ( send_reply ) { \
                NackReply nack; \
                nack.set_err_code( ID_INTERNAL_ERROR ); \
                nack.set_err_msg( "Unknown exception type" ); \
                m_msg_buf.serialize( nack ); } \
        } \
        DL_TRACE( "Sent: " << reply.DebugString()); \
    } \
    else { \
        DL_ERROR( "W"<<m_tid<<": dynamic cast of msg buffer failed!" );\
    } \
    delete base_msg; \
} \
else { \
    DL_ERROR( "W"<<m_tid<<": buffer parse failed due to unregistered msg type." ); \
} \
return send_reply;

/// This method wraps all direct-to-DB message handler calls
template<typename RQ, typename RP, void (DatabaseAPI::*func)( const RQ &, RP &)>
bool
ClientWorker::dbPassThrough( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RQ, RP )

    m_db_client.setClient( a_uid );

    (m_db_client.*func)( *request, reply );

    PROC_MSG_END
}

bool
ClientWorker::procVersionRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( VersionRequest, VersionReply )
    (void)a_uid;
    DL_INFO( "Ver request" );

    reply.set_major( VER_MAJOR );
    reply.set_mapi_major( VER_MAPI_MAJOR );
    reply.set_mapi_minor( VER_MAPI_MINOR );
    reply.set_core( VER_CORE );
    reply.set_repo( VER_REPO );
    reply.set_web( VER_WEB );
    reply.set_client_py( VER_CLIENT_PY );

    PROC_MSG_END
}

bool
ClientWorker::procAuthenticateByPasswordRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( AuthenticateByPasswordRequest, AuthStatusReply )

    DL_INFO( "Starting manual password authentication for " << request->uid() );

    m_db_client.setClient( request->uid() );
    m_db_client.clientAuthenticateByPassword( request->password(), reply );

    DL_INFO( "Manual authentication SUCCESS for " << reply.uid() );

    m_core.authenticateClient( a_uid, reply.uid() );

    PROC_MSG_END
}

bool
ClientWorker::procAuthenticateByTokenRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( AuthenticateByTokenRequest, AuthStatusReply )

    DL_INFO( "Starting manual token authentication" );

    m_db_client.setClient( a_uid );
    m_db_client.clientAuthenticateByToken( request->token(), reply );

    DL_INFO( "Manual authentication SUCCESS for " << reply.uid() );

    m_core.authenticateClient( a_uid, reply.uid() );

    PROC_MSG_END
}

bool
ClientWorker::procGetAuthStatusRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( GetAuthStatusRequest, AuthStatusReply )

    if ( strncmp( a_uid.c_str(), "anon_", 5 ) == 0 )
    {
        DL_INFO(a_uid << " not authorized");
        reply.set_auth( false );
    }
    else
    {
        DL_INFO(a_uid << " authorized");
        reply.set_auth( true );
        reply.set_uid( a_uid );
    }

    PROC_MSG_END
}

bool
ClientWorker::procGenerateCredentialsRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( GenerateCredentialsRequest, GenerateCredentialsReply )

    DL_INFO( "Generating new credentials for " << a_uid );

    m_db_client.setClient( a_uid );

    string pub_key, priv_key;

    if ( !m_db_client.userGetKeys( pub_key, priv_key ))
    {
        char public_key[41];
        char secret_key[41];

        if ( zmq_curve_keypair( public_key, secret_key ) != 0 )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Key generation failed: " << zmq_strerror( errno ));

        pub_key = public_key;
        priv_key = secret_key;

        m_db_client.userSetKeys( pub_key, priv_key );
    }

    reply.set_pub_key( pub_key );
    reply.set_priv_key( priv_key );

    if ( request->has_domain() && request->has_uid() )
    {
        m_db_client.clientLinkIdentity( request->domain() + "." + to_string( request->uid() ));
    }

    PROC_MSG_END
}


bool
ClientWorker::procRevokeCredentialsRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( RevokeCredentialsRequest, AckReply )

    DL_INFO( "Revoking credentials for " << a_uid );

    m_db_client.setClient( a_uid );
    m_db_client.userClearKeys();

    PROC_MSG_END
}


bool
ClientWorker::procDataGetRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataGetRequest, DataGetReply )

    DL_INFO( "CWORKER procDataGetRequest, uid: " << a_uid );

    libjson::Value result;

    m_db_client.setClient( a_uid );
    m_db_client.taskInitDataGet( *request, reply, result );
    handleTaskResponse( result );

    PROC_MSG_END
}


bool
ClientWorker::procDataPutRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataPutRequest, DataPutReply )

    DL_INFO( "CWORKER procDataPutRequest, uid: " << a_uid );

    libjson::Value result;

    m_db_client.setClient( a_uid );
    m_db_client.taskInitDataPut( *request, reply, result );
    handleTaskResponse( result );

    PROC_MSG_END
}

void
ClientWorker::schemaEnforceRequiredProperties( const nlohmann::json & a_schema )
{
    // json_schema validator does not check for required fields in schema
    // Must include properties and type: Object
    if ( !a_schema.is_object() )
        EXCEPT(1,"Schema must be a JSON object.");

    nlohmann::json::const_iterator i = a_schema.find("properties");

    if ( i == a_schema.end() )
        EXCEPT(1,"Schema is missing required 'properties' field.");

    if ( !i.value().is_object() )
        EXCEPT(1,"Schema properties field must be a JSON object.");

    i = a_schema.find("type");

    if ( i == a_schema.end() )
        EXCEPT(1,"Schema is missing required 'type' field.");

    if ( !i.value().is_string() || i.value().get<string>() != "object" )
        EXCEPT(1,"Schema type must be 'object'.");
}

bool
ClientWorker::procSchemaCreateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( SchemaCreateRequest, AckReply )

    m_db_client.setClient( a_uid );

    DL_INFO( "Schema create" );

    try
    {
        nlohmann::json schema = nlohmann::json::parse( request->def() );

        schemaEnforceRequiredProperties( schema );

        nlohmann::json_schema::json_validator validator( bind( &ClientWorker::schemaLoader, this, placeholders::_1, placeholders::_2 ));

        validator.set_root_schema( schema );

        m_db_client.schemaCreate( *request );
    }
    catch( exception & e )
    {
        EXCEPT_PARAM( 1, "Invalid metadata schema: " << e.what() );
        DL_ERROR( "Invalid metadata schema: " << e.what() );
    }

    PROC_MSG_END
}


bool
ClientWorker::procSchemaReviseRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( SchemaReviseRequest, AckReply )

    m_db_client.setClient( a_uid );

    DL_INFO( "Schema revise" );

    if ( request->has_def() )
    {
        try
        {
            nlohmann::json schema = nlohmann::json::parse( request->def() );

            schemaEnforceRequiredProperties( schema );

            nlohmann::json_schema::json_validator validator( bind( &ClientWorker::schemaLoader, this, placeholders::_1, placeholders::_2 ));

            validator.set_root_schema( schema );
        }
        catch( exception & e )
        {
            EXCEPT_PARAM( 1, "Invalid metadata schema: " << e.what() );
            DL_ERROR( "Invalid metadata schema: " << e.what() );
        }
    }

    m_db_client.schemaRevise( *request );

    PROC_MSG_END
}

bool
ClientWorker::procSchemaUpdateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( SchemaUpdateRequest, AckReply )

    m_db_client.setClient( a_uid );

    DL_INFO( "Schema update" );

    if ( request->has_def() )
    {
        try
        {
            nlohmann::json schema = nlohmann::json::parse( request->def() );

            schemaEnforceRequiredProperties( schema );

            nlohmann::json_schema::json_validator validator( bind( &ClientWorker::schemaLoader, this, placeholders::_1, placeholders::_2 ));

            validator.set_root_schema( schema );
        }
        catch( exception & e )
        {
            EXCEPT_PARAM( 1, "Invalid metadata schema: " << e.what() );
            DL_ERROR( "Invalid metadata schema: " << e.what() );
        }
    }

    m_db_client.schemaUpdate( *request );

    PROC_MSG_END
}

bool
ClientWorker::procMetadataValidateRequest( const std::string & a_uid )
{
    DL_INFO( "Meta validate" );

    PROC_MSG_BEGIN( MetadataValidateRequest, MetadataValidateReply )

    m_db_client.setClient( a_uid );

    nlohmann::json schema;

    try
    {
        libjson::Value sch;
        DL_INFO( "Schema " << request->sch_id() );

        m_db_client.schemaView( request->sch_id(), sch );

        DL_INFO( "Schema: " << sch.asArray().begin()->asObject().getValue("def").toString() );

        schema = nlohmann::json::parse( sch.asArray().begin()->asObject().getValue("def").toString() );
    }
    catch( TraceException & e )
    {
        throw;
    }
    catch( exception & e )
    {
        EXCEPT_PARAM(1,"Schema parse error: " << e.what() );
    }

    //DL_INFO( "Schema " << schema );

    nlohmann::json_schema::json_validator validator( bind( &ClientWorker::schemaLoader, this, placeholders::_1, placeholders::_2 ));

    try
    {
        //DL_INFO( "Setting root schema" );
        validator.set_root_schema( schema );
        //DL_INFO( "Validating" );

        nlohmann::json md = nlohmann::json::parse( request->metadata() );

        m_validator_err.clear();
        validator.validate( md, *this );
    }
    catch( exception & e )
    {
        m_validator_err = string( "Invalid metadata schema: ") + e.what() + "\n";
        DL_ERROR( "Invalid metadata schema: " << e.what() );
    }

    
    if ( m_validator_err.size() )
    {
        reply.set_errors( m_validator_err );
    }

    PROC_MSG_END
}


bool
ClientWorker::procRecordCreateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordCreateRequest, RecordDataReply )

    m_db_client.setClient( a_uid );

    // Validate metdata if present

    //libjson::Value result;

    DL_INFO("Creating record");

    m_validator_err.clear();

    if ( request->has_metadata() && request->has_sch_id() )
    {
        //DL_INFO("Has metadata/schema");
        //DL_INFO( "Must validate JSON, schema " << s->second.asString() );

        nlohmann::json schema;

        try
        {
            libjson::Value sch;
            m_db_client.schemaView( request->sch_id(), sch );
            schema = nlohmann::json::parse( sch.asArray().begin()->asObject().getValue("def").toString() );

            nlohmann::json_schema::json_validator validator( bind( &ClientWorker::schemaLoader, this, placeholders::_1, placeholders::_2 ));

            try
            {
                //DL_INFO( "Setting root schema" );
                validator.set_root_schema( schema );
                //DL_INFO( "Validating" );

                nlohmann::json md = nlohmann::json::parse( request->metadata() );

                m_validator_err.clear();
                validator.validate( md, *this );
            }
            catch( exception & e )
            {
                m_validator_err = string( "Invalid metadata schema: ") + e.what() + "\n";
                DL_ERROR( "Invalid metadata schema: " << e.what() );
            }
        }
        catch( exception & e )
        {
            m_validator_err = string( "Metadata schema error: ") + e.what() + "\n";
            DL_ERROR( "Could not load metadata schema: " << e.what() );
        }

        if ( request->has_sch_enforce() && m_validator_err.size() )
        {
            EXCEPT( 1, m_validator_err );
        }
    }
    else if ( request->has_sch_enforce() )
    {
        EXCEPT( 1, "Enforce schema option specified, but metadata and/or schema ID is missing." );
    }

    m_db_client.recordCreate( *request, reply );

    if ( m_validator_err.size() )
    {
        DL_ERROR( "Validation error - update record" );

        //const string & id = obj.getString("id");
        RecordData * data = reply.mutable_data(0);

        m_db_client.recordUpdateSchemaError( data->id(), m_validator_err );
        // TODO need a def for md_err mask
        data->set_notes( data->notes() | NOTE_MASK_MD_ERR );
    }

    PROC_MSG_END
}


bool
ClientWorker::procRecordUpdateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordUpdateRequest, RecordDataReply )

    m_db_client.setClient( a_uid );

    // Validate metdata if present

    libjson::Value result;
    //nlohmann::json result;

    DL_INFO("Updating record");

    m_validator_err.clear();

    if ( request->has_metadata() || ( request->has_sch_id() && request->sch_id().size() ) || request->has_sch_enforce() )
    {
        //DL_INFO("Has metadata/schema");
        string metadata = request->has_metadata()?request->metadata():"";
        string sch_id = request->has_sch_id()?request->sch_id():"";

        // If update does not include metadata AND schema, then we must load the missing parts from DB before we can validate here
        if ( !request->has_metadata() || !request->has_sch_id() )
        {
            RecordViewRequest view_request;
            RecordDataReply view_reply;

            view_request.set_id( request->id() );

            m_db_client.recordView( view_request, view_reply );

            if ( !request->has_metadata() )
                metadata = view_reply.data(0).metadata();

            if ( !request->has_sch_id() )
                sch_id = view_reply.data(0).sch_id();
        }

        if ( metadata.size() && sch_id.size() )
        {
            DL_INFO( "Must validate JSON, schema " << sch_id );

            libjson::Value sch;
            m_db_client.schemaView( sch_id, sch );

            DL_INFO( "Schema record JSON:" << sch.toString() );
            //DL_INFO( "Schema def STR:" << sch.asObject().getValue("def").toString() );

            nlohmann::json schema = nlohmann::json::parse( sch.asArray().begin()->asObject().getValue("def").toString() );

            DL_INFO( "Schema nlohmann: " << schema );

            nlohmann::json_schema::json_validator validator( bind( &ClientWorker::schemaLoader, this, placeholders::_1, placeholders::_2 ));

            try
            {
                DL_INFO( "Setting root schema" );
                validator.set_root_schema( schema );

                // TODO This is a hacky way to convert between JSON implementations...
                DL_INFO( "Parse md" );

                nlohmann::json md = nlohmann::json::parse( metadata );

                DL_INFO( "Validating" );

                validator.validate( md, *this );
            }
            catch( exception & e )
            {
                m_validator_err = string( "Invalid metadata schema: ") + e.what() + "\n";
                DL_ERROR( "Invalid metadata schema: " << e.what() );
            }

            if ( request->has_sch_enforce() && m_validator_err.size() )
            {
                EXCEPT( 1, m_validator_err );
            }
        }
        else if ( request->has_sch_enforce() )
        {
            EXCEPT( 1, "Enforce schema option specified, but metadata and/or schema ID is missing." );
        }
    }

    m_db_client.recordUpdate( *request, reply, result );

    if ( m_validator_err.size() )
    {
        DL_ERROR( "Validation error - update record" );

        m_db_client.recordUpdateSchemaError( request->id(), m_validator_err );
        // Must find and update md_err flag in reply (always 1 data entry)
        RecordData * data = reply.mutable_data(0);
        data->set_notes( data->notes() | NOTE_MASK_MD_ERR );

        for ( int i = 0; i < reply.update_size(); i++ )
        {
            ListingData * data = reply.mutable_update(i);
            if ( data->id() == request->id() )
            {
                // TODO need a def for md_err mask
                data->set_notes( data->notes() | NOTE_MASK_MD_ERR );
            }
        }
    }

    PROC_MSG_END
}


bool
ClientWorker::procRecordUpdateBatchRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordUpdateBatchRequest, RecordDataReply )

    m_db_client.setClient( a_uid );

    libjson::Value result;

    m_db_client.recordUpdateBatch( *request, reply, result );

    handleTaskResponse( result );

    PROC_MSG_END
}


bool
ClientWorker::procRecordDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordDeleteRequest, TaskDataReply )

    m_db_client.setClient( a_uid );

    vector<string> ids;

    ids.reserve( request->id_size() );
    for ( int i = 0; i < request->id_size(); i++ )
        ids.push_back( request->id(i) );

    recordCollectionDelete( ids, reply );

    PROC_MSG_END
}


bool
ClientWorker::procCollectionDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( CollDeleteRequest, TaskDataReply )

    m_db_client.setClient( a_uid );

    vector<string> ids;

    ids.reserve( request->id_size() );
    for ( int i = 0; i < request->id_size(); i++ )
        ids.push_back( request->id(i) );

    recordCollectionDelete( ids, reply );

    PROC_MSG_END
}


void
ClientWorker::recordCollectionDelete( const std::vector<std::string> & a_ids, TaskDataReply & a_reply )
{
    libjson::Value result;

    m_db_client.taskInitRecordCollectionDelete( a_ids, a_reply, result );

    handleTaskResponse( result );
}


bool
ClientWorker::procRecordAllocChangeRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordAllocChangeRequest, RecordAllocChangeReply )

    m_db_client.setClient( a_uid );

    libjson::Value result;

    m_db_client.taskInitRecordAllocChange( *request, reply, result );

    handleTaskResponse( result );

    PROC_MSG_END
}


bool
ClientWorker::procRecordOwnerChangeRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordOwnerChangeRequest, RecordOwnerChangeReply )

    m_db_client.setClient( a_uid );

    libjson::Value result;

    m_db_client.taskInitRecordOwnerChange( *request, reply, result );

    handleTaskResponse( result );

    PROC_MSG_END
}


bool
ClientWorker::procProjectDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( ProjectDeleteRequest, TaskDataReply )

    m_db_client.setClient( a_uid );

    libjson::Value result;

    m_db_client.taskInitProjectDelete( *request, reply, result );

    handleTaskResponse( result );

    PROC_MSG_END
}

bool
ClientWorker::procRepoAllocationCreateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RepoAllocationCreateRequest, TaskDataReply )

    m_db_client.setClient( a_uid );

    libjson::Value result;

    m_db_client.taskInitRepoAllocationCreate( *request, reply, result );

    handleTaskResponse( result );

    PROC_MSG_END
}

bool
ClientWorker::procRepoAllocationDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RepoAllocationDeleteRequest, TaskDataReply )

    m_db_client.setClient( a_uid );

    libjson::Value result;

    m_db_client.taskInitRepoAllocationDelete( *request, reply, result );

    handleTaskResponse( result );

    PROC_MSG_END
}


bool
ClientWorker::procProjectSearchRequest( const std::string & a_uid )
{
    (void) a_uid;

    PROC_MSG_BEGIN( ProjectSearchRequest, ProjectDataReply )

    EXCEPT( 1, "Not implemented" );

/*
    m_db_client.setClient( a_uid );
    DL_INFO("about to parse query[" << request->text_query() << "]" );
    vector<string> scope;
    for ( int i = 0; i < request->scope_size(); i++ )
        scope.push_back( request->scope(i) );
    string q = parseProjectQuery( request->text_query(), scope );
    DL_INFO("parsed query[" << q << "]" );
    m_db_client.projSearch( q, reply );
*/

    PROC_MSG_END
}


bool
ClientWorker::procRepoAuthzRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( RepoAuthzRequest, AckReply )

    DL_INFO( "AUTHZ repo: " << a_uid << ", usr: " << request->client() /*<< ", repo: " << request->repo()*/ << ", file: " << request->file() << ", act: " << request->action() );

    m_db_client.setClient( request->client() );
    m_db_client.repoAuthz( *request, reply );

    PROC_MSG_END
}


bool
ClientWorker::procUserGetAccessTokenRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( UserGetAccessTokenRequest, UserAccessTokenReply )

    string acc_tok, ref_tok;
    uint32_t expires_in;

    m_db_client.setClient( a_uid );
    m_db_client.userGetAccessToken( acc_tok, ref_tok, expires_in );

    if ( expires_in < 300 )
    {
        DL_INFO( "Refreshing access token for " << a_uid );

        m_globus_api.refreshAccessToken( ref_tok, acc_tok, expires_in );
        m_db_client.userSetAccessToken( acc_tok, expires_in, ref_tok );

    }

    reply.set_access( acc_tok );
    reply.set_expires_in( expires_in );

    PROC_MSG_END
}

void
ClientWorker::handleTaskResponse( libjson::Value & a_result )
{
    libjson::Value::Object & obj = a_result.asObject();

    if ( obj.has( "task" ))
    {
        libjson::Value::Object & task_obj = obj.asObject();

        if ( task_obj.getNumber( "status" ) != TS_BLOCKED )
            TaskMgr::getInstance().newTask( task_obj.getString( "_id" ));
    }
}

/*
string
ClientWorker::parseProjectQuery( const string & a_text_query, const vector<string> & a_scope )
{
    string phrase = parseSearchTextPhrase( a_text_query );

    if ( phrase.size() == 0 )
        EXCEPT(1,"Empty query string");

    string result;

    if ( a_scope.size() )
    {
        result += string("for i in intersection((for i in projview search analyzer(") + phrase + ",'text_en') return i),(";

        if ( a_scope.size() > 1 )
            result += "for i in union((";

        for ( vector<string>::const_iterator c = a_scope.begin(); c != a_scope.end(); c++ )
        {
            if ( c != a_scope.begin() )
                result += "),(";

            // TODO Add support for organization, facility
            //if ( c->compare( 0, 2, "u/" ) == 0 )
            //{
                result += string("for i in 1..1 inbound '") + ( c->compare( 0, 2, "u/" ) != 0 ? "u/" : "" ) + *c + "' owner, admin filter is_same_collection('p',i) return i";
            //}
        }

        if ( a_scope.size() > 1 )
            result += ")) return i";

        result += "))";
    }
    else
        result += string("for i in projview search analyzer(") + phrase + ",'text_en')";

    // TODO Add sort order
    result += " limit 100 return {id:i._id,title:i.title,owner:i.owner}";

    return result;
}
*/

void
ClientWorker::schemaLoader( const nlohmann::json_uri & a_uri, nlohmann::json & a_value )
{
    DL_INFO( "Load schema, scheme: " << a_uri.scheme() << ", path: " << a_uri.path() << ", auth: " << a_uri.authority() << ", id: " << a_uri.identifier() );

    libjson::Value sch;
    std::string id = a_uri.path();

    id = id.substr( 1 ); // Skip leading "/"
    m_db_client.schemaView( id, sch );

    a_value = nlohmann::json::parse( sch.asArray().begin()->asObject().getValue("def").toString() );
    DL_INFO( "Loaded schema: " << a_value );
}

}}
