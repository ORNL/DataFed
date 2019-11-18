#include <iostream>
#include <atomic>
#include <rapidjson/document.h>
#include <rapidjson/error/en.h>
#include <boost/tokenizer.hpp>
#include <CoreWorker.hpp>
#include <TraceException.hpp>
#include <DynaLog.hpp>
#include <Util.hpp>
#include <Version.pb.h>
#include <SDMS.pb.h>
#include <SDMS_Anon.pb.h>
#include <SDMS_Auth.pb.h>

using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace Core {


map<uint16_t,Worker::msg_fun_t> Worker::m_msg_handlers;


Worker::Worker( IWorkerMgr & a_mgr, size_t a_tid ) :
    m_mgr(a_mgr), m_tid(a_tid), m_worker_thread(0), m_run(true),
    m_db_client( a_mgr.getDbURL(), a_mgr.getDbUser(), a_mgr.getDbPass() )
{
    setupMsgHandlers();
    m_worker_thread = new thread( &Worker::workerThread, this );
}

Worker::~Worker()
{
    stop();
    wait();
}

void
Worker::stop()
{
    m_run = false;
}

void
Worker::wait()
{
    if ( m_worker_thread )
    {
        m_worker_thread->join();
        delete m_worker_thread;
        m_worker_thread = 0;
    }
}

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[MsgBuf::findMessageType( proto_id, #msg )] = func
#define SET_MSG_HANDLER_DB(proto_id,rq,rp,func) m_msg_handlers[MsgBuf::findMessageType( proto_id, #rq )] = &Worker::dbPassThrough<rq,rp,&DatabaseClient::func>

void
Worker::setupMsgHandlers()
{
    static std::atomic_flag lock = ATOMIC_FLAG_INIT;

    if ( lock.test_and_set() )
        return;

    try
    {
        uint8_t proto_id = REG_PROTO( SDMS::Anon );

        SET_MSG_HANDLER( proto_id, StatusRequest, &Worker::procStatusRequest );
        SET_MSG_HANDLER( proto_id, VersionRequest, &Worker::procVersionRequest );
        SET_MSG_HANDLER( proto_id, AuthenticateByPasswordRequest, &Worker::procAuthenticateByPasswordRequest );
        SET_MSG_HANDLER( proto_id, AuthenticateByTokenRequest, &Worker::procAuthenticateByTokenRequest );
        SET_MSG_HANDLER( proto_id, GetAuthStatusRequest, &Worker::procGetAuthStatusRequest );

        proto_id = REG_PROTO( SDMS::Auth );

        // Requests that require the server to take action
        SET_MSG_HANDLER( proto_id, GenerateCredentialsRequest, &Worker::procGenerateCredentialsRequest );
        SET_MSG_HANDLER( proto_id, RevokeCredentialsRequest, &Worker::procRevokeCredentialsRequest );
        SET_MSG_HANDLER( proto_id, DataGetRequest, &Worker::procDataGetRequest );
        SET_MSG_HANDLER( proto_id, DataPutRequest, &Worker::procDataPutRequest );
        SET_MSG_HANDLER( proto_id, DataDeleteRequest, &Worker::procDataDeleteRequest );
        SET_MSG_HANDLER( proto_id, RecordUpdateRequest, &Worker::procRecordUpdateRequest );
        SET_MSG_HANDLER( proto_id, RecordUpdateBatchRequest, &Worker::procRecordUpdateBatchRequest );
        SET_MSG_HANDLER( proto_id, RecordDeleteRequest, &Worker::procRecordDeleteRequest );
        SET_MSG_HANDLER( proto_id, RecordSearchRequest, &Worker::procRecordSearchRequest );
        SET_MSG_HANDLER( proto_id, ProjectSearchRequest, &Worker::procProjectSearchRequest );
        SET_MSG_HANDLER( proto_id, QueryCreateRequest, &Worker::procQueryCreateRequest );
        SET_MSG_HANDLER( proto_id, QueryUpdateRequest, &Worker::procQueryUpdateRequest );
        SET_MSG_HANDLER( proto_id, CollDeleteRequest, &Worker::procCollectionDeleteRequest );
        SET_MSG_HANDLER( proto_id, ProjectDeleteRequest, &Worker::procProjectDeleteRequest );
        SET_MSG_HANDLER( proto_id, QueryDeleteRequest, &Worker::procQueryDeleteRequest );
        SET_MSG_HANDLER( proto_id, RepoAllocationSetRequest, &Worker::procRepoAllocationSetRequest );
        SET_MSG_HANDLER( proto_id, RepoAuthzRequest, &Worker::procRepoAuthzRequest );

        // Requests that can be handled by DB client directly
        SET_MSG_HANDLER_DB( proto_id, CheckPermsRequest, CheckPermsReply, checkPerms );
        SET_MSG_HANDLER_DB( proto_id, GetPermsRequest, GetPermsReply, getPerms );
        SET_MSG_HANDLER_DB( proto_id, UserSaveTokensRequest, AckReply, userSaveTokens );
        SET_MSG_HANDLER_DB( proto_id, UserCreateRequest, UserDataReply, userCreate );
        SET_MSG_HANDLER_DB( proto_id, UserViewRequest, UserDataReply, userView );
        SET_MSG_HANDLER_DB( proto_id, UserUpdateRequest, UserDataReply, userUpdate );
        SET_MSG_HANDLER_DB( proto_id, UserListAllRequest, UserDataReply, userListAll );
        SET_MSG_HANDLER_DB( proto_id, UserListCollabRequest, UserDataReply, userListCollab );
        SET_MSG_HANDLER_DB( proto_id, UserFindByUUIDsRequest, UserDataReply, userFindByUUIDs );
        SET_MSG_HANDLER_DB( proto_id, UserGetRecentEPRequest, UserGetRecentEPReply, userGetRecentEP );
        SET_MSG_HANDLER_DB( proto_id, UserSetRecentEPRequest, AckReply, userSetRecentEP );
        SET_MSG_HANDLER_DB( proto_id, ProjectCreateRequest, ProjectDataReply, projCreate );
        SET_MSG_HANDLER_DB( proto_id, ProjectUpdateRequest, ProjectDataReply, projUpdate );
        SET_MSG_HANDLER_DB( proto_id, ProjectViewRequest, ProjectDataReply, projView );
        SET_MSG_HANDLER_DB( proto_id, ProjectListRequest, ListingReply, projList );
        //SET_MSG_HANDLER_DB( proto_id, ProjectListRequest, ProjectDataReply, projList );
        SET_MSG_HANDLER_DB( proto_id, RecordViewRequest, RecordDataReply, recordView );
        SET_MSG_HANDLER_DB( proto_id, RecordCreateRequest, RecordDataReply, recordCreate );
        SET_MSG_HANDLER_DB( proto_id, RecordCreateBatchRequest, RecordDataReply, recordCreateBatch );
        //SET_MSG_HANDLER_DB( proto_id, RecordUpdateRequest, RecordDataReply, recordUpdate );
        //SET_MSG_HANDLER_DB( proto_id, RecordUpdateBatchRequest, RecordDataReply, recordUpdateBatch );
        SET_MSG_HANDLER_DB( proto_id, RecordLockRequest, ListingReply, recordLock );
        SET_MSG_HANDLER_DB( proto_id, RecordListByAllocRequest, ListingReply, recordListByAlloc );
        SET_MSG_HANDLER_DB( proto_id, RecordGetDependenciesRequest, ListingReply, recordGetDependencies );
        SET_MSG_HANDLER_DB( proto_id, RecordGetDependencyGraphRequest, ListingReply, recordGetDependencyGraph );
        SET_MSG_HANDLER_DB( proto_id, DataPathRequest, DataPathReply, dataPath );
        SET_MSG_HANDLER_DB( proto_id, DataGetPreprocRequest, ListingReply, dataGetPreproc );
        SET_MSG_HANDLER_DB( proto_id, CollListRequest, CollDataReply, collList );
        SET_MSG_HANDLER_DB( proto_id, CollListPublishedRequest, ListingReply, collListPublished );
        SET_MSG_HANDLER_DB( proto_id, CollCreateRequest, CollDataReply, collCreate );
        SET_MSG_HANDLER_DB( proto_id, CollUpdateRequest, CollDataReply, collUpdate );
        SET_MSG_HANDLER_DB( proto_id, CollViewRequest, CollDataReply, collView );
        SET_MSG_HANDLER_DB( proto_id, CollReadRequest, ListingReply, collRead );
        SET_MSG_HANDLER_DB( proto_id, CollWriteRequest, ListingReply, collWrite );
        SET_MSG_HANDLER_DB( proto_id, CollMoveRequest, AckReply, collMove );
        SET_MSG_HANDLER_DB( proto_id, CollGetParentsRequest, CollPathReply, collGetParents );
        SET_MSG_HANDLER_DB( proto_id, CollGetOffsetRequest, CollGetOffsetReply, collGetOffset );
        SET_MSG_HANDLER_DB( proto_id, QueryListRequest, ListingReply, queryList );
        SET_MSG_HANDLER_DB( proto_id, QueryViewRequest, QueryDataReply, queryView );
        SET_MSG_HANDLER_DB( proto_id, QueryExecRequest, ListingReply, queryExec );
        SET_MSG_HANDLER_DB( proto_id, XfrViewRequest, XfrDataReply, xfrView );
        SET_MSG_HANDLER_DB( proto_id, XfrListRequest, XfrDataReply, xfrList );
        SET_MSG_HANDLER_DB( proto_id, ACLViewRequest, ACLDataReply, aclView );
        SET_MSG_HANDLER_DB( proto_id, ACLUpdateRequest, ACLDataReply, aclUpdate );
        SET_MSG_HANDLER_DB( proto_id, ACLByUserRequest, UserDataReply, aclByUser );
        SET_MSG_HANDLER_DB( proto_id, ACLByUserListRequest, ListingReply, aclByUserList );
        SET_MSG_HANDLER_DB( proto_id, ACLByProjRequest, ProjectDataReply, aclByProj );
        SET_MSG_HANDLER_DB( proto_id, ACLByProjListRequest, ListingReply, aclByProjList );
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
        SET_MSG_HANDLER_DB( proto_id, RepoAllocationStatsRequest, RepoAllocationStatsReply, repoAllocationStats );
        SET_MSG_HANDLER_DB( proto_id, TopicListRequest, ListingReply, topicList );
        SET_MSG_HANDLER_DB( proto_id, TopicLinkRequest, AckReply, topicLink );
        SET_MSG_HANDLER_DB( proto_id, TopicUnlinkRequest, AckReply, topicUnlink );
    }
    catch( TraceException & e)
    {
        DL_ERROR( "CoreWorker::setupMsgHandlers, exception: " << e.toString() );
        throw;
    }
}


void
Worker::workerThread()
{
    DL_DEBUG( "W" << m_tid << " thread started" );

    MsgComm         comm( "inproc://workers", MsgComm::DEALER, false );
    uint16_t        msg_type;
    map<uint16_t,msg_fun_t>::iterator handler;

    Anon::NackReply nack;
    nack.set_err_code( ID_AUTHN_REQUIRED );
    nack.set_err_msg( "Authentication required" );

    while ( m_run )
    {
        try
        {
            if ( comm.recv( m_msg_buf, true, 1000 ))
            {
                msg_type = m_msg_buf.getMsgType();

                DL_DEBUG( "W"<<m_tid<<" recvd msg type: " << msg_type << " from ["<< m_msg_buf.getUID() <<"]" );

                if ( strncmp( m_msg_buf.getUID().c_str(), "anon_", 5 ) == 0 && msg_type > 0x1FF )
                {
                    DL_WARN( "W"<<m_tid<<" unauthorized access attempt from anon user" );
                    m_msg_buf.serialize( nack );
                    comm.send( m_msg_buf );
                }
                else
                {
                    handler = m_msg_handlers.find( msg_type );
                    if ( handler != m_msg_handlers.end() )
                    {
                        DL_TRACE( "W"<<m_tid<<" calling handler" );

                        if ( (this->*handler->second)( m_msg_buf.getUID() ))
                        {
                            comm.send( m_msg_buf );
                        }
                    }
                    else
                        DL_ERROR( "W"<<m_tid<<" recvd unregistered msg type: " << msg_type );
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
                nack.set_err_msg( e.toString() ); \
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


template<typename RQ, typename RP, void (DatabaseClient::*func)( const RQ &, RP &)>
bool
Worker::dbPassThrough( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RQ, RP )

    m_db_client.setClient( a_uid );

    (m_db_client.*func)( *request, reply );

    PROC_MSG_END
}

bool
Worker::procStatusRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( StatusRequest, StatusReply )
    (void)a_uid;

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}

bool
Worker::procVersionRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( VersionRequest, VersionReply )
    (void)a_uid;
    DL_INFO( "Ver request" );

    reply.set_major( VER_MAJOR );
    reply.set_minor( VER_MINOR );
    reply.set_build( VER_BUILD );

    PROC_MSG_END
}

bool
Worker::procAuthenticateByPasswordRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( AuthenticateByPasswordRequest, AuthStatusReply )

    DL_INFO( "Starting manual password authentication for " << request->uid() );

    m_db_client.setClient( request->uid() );
    m_db_client.clientAuthenticateByPassword( request->password(), reply );

    DL_INFO( "Manual authentication SUCCESS for " << reply.uid() );

    m_mgr.authorizeClient( a_uid, reply.uid() );

    PROC_MSG_END
}

bool
Worker::procAuthenticateByTokenRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( AuthenticateByTokenRequest, AuthStatusReply )

    DL_INFO( "Starting manual token authentication" );

    m_db_client.setClient( a_uid );
    m_db_client.clientAuthenticateByToken( request->token(), reply );

    DL_INFO( "Manual authentication SUCCESS for " << reply.uid() );

    m_mgr.authorizeClient( a_uid, reply.uid() );

    PROC_MSG_END
}

bool
Worker::procGetAuthStatusRequest( const std::string & a_uid )
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
Worker::procGenerateCredentialsRequest( const std::string & a_uid )
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
Worker::procRevokeCredentialsRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( RevokeCredentialsRequest, AckReply )

    DL_INFO( "Revoking credentials for " << a_uid );

    m_db_client.setClient( a_uid );
    m_db_client.userClearKeys();

    PROC_MSG_END
}


bool
Worker::procDataGetRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataGetRequest, XfrDataReply )
    if ( request->id_size() > 1 )
    {
        DL_INFO( "Data GET, uid: " << a_uid << ", rec count: " << request->id_size() << ", path: " << request->path() );
    }
    else
    {
        DL_INFO( "Data GET, uid: " << a_uid << ", id: " << request->id(0) << ", path: " << request->path() );
    }

    m_db_client.setClient( a_uid );
    vector<string> ids;
    int i;

    ids.reserve( request->id_size() );
    for ( i = 0; i < request->id_size(); i++ )
        ids.push_back( request->id(i) );

    m_db_client.xfrInit( ids, request->path(), 0, XM_GET, reply );

    //if ( reply.xfr_size() != 1 )
    //    EXCEPT( ID_INTERNAL_ERROR, "Invalid data returned from DB service" );

    for ( int i = 0; i < reply.xfr_size(); i++ )
    {
        m_mgr.handleNewXfr( reply.xfr(i) );
    }

    PROC_MSG_END
}

bool
Worker::procDataPutRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataPutRequest, XfrDataReply )

    DL_INFO( "Data PUT, uid: " << a_uid << ", id: " << request->id() << ", path: " << request->path() );

    m_db_client.setClient( a_uid );
    //vector<string> ids = { request->id() };

    m_db_client.xfrInit( { request->id() }, request->path(), request->has_ext()?&request->ext():0, XM_PUT, reply );

    if ( reply.xfr_size() != 1 )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid data returned from DB service" );

    m_mgr.handleNewXfr( reply.xfr(0) );

    PROC_MSG_END
}


bool
Worker::procDataDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataDeleteRequest, AckReply )

    DL_INFO( "Data RAW-DELETE, uid: " << a_uid );

    // Get data path and delete raw data first, then update data record

    vector<string> ids;
    int i;

    ids.reserve( request->id_size() );
    for ( i = 0; i < request->id_size(); i++ )
        ids.push_back( request->id(i) );

    vector<RepoRecordDataLocations> loc;
    m_db_client.recordGetDataLocation( ids, loc );

    // TODO This must be durable, mgr should initiate record updates AFTER data is deleted
    m_mgr.dataDelete( loc );

    m_db_client.setClient( a_uid );

    RecordUpdateRequest upd_req;
    RecordDataReply upd_reply;

    for ( vector<RepoRecordDataLocations>::iterator r = loc.begin(); r != loc.end(); r++ )
    {
        for ( i = 0; i < r->loc_size(); i++ )
        {
            upd_req.set_id( r->loc(i).id() );
            upd_req.set_size( 0 );

            m_db_client.recordUpdate( upd_req, upd_reply, loc );
        }
    }

    PROC_MSG_END
}


bool
Worker::procRecordUpdateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordUpdateRequest, RecordDataReply )

    vector<RepoRecordDataLocations> locs;

    // TODO Acquire write lock here

    m_db_client.setClient( a_uid );
    m_db_client.recordUpdate( *request, reply, locs );

    // TODO Must be durable (use DB to track delete progress)

    if ( locs.size() )
        m_mgr.dataDelete( locs );

    PROC_MSG_END
}


bool
Worker::procRecordUpdateBatchRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordUpdateBatchRequest, RecordDataReply )

    vector<RepoRecordDataLocations> locs;

    // TODO Acquire write lock here

    m_db_client.setClient( a_uid );
    m_db_client.recordUpdateBatch( *request, reply, locs );

    // TODO Must be durable (use DB to track delete progress)

    if ( locs.size() )
        m_mgr.dataDelete( locs );

    PROC_MSG_END
}


bool
Worker::procRecordDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordDeleteRequest, AckReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Delete record FIRST - If successful, this verifies that client has permission and ID is valid
    vector<string> ids;
    int i;

    ids.reserve( request->id_size() );
    for ( i = 0; i < request->id_size(); i++ )
        ids.push_back( request->id(i) );

    vector<RepoRecordDataLocations> loc;

    m_db_client.setClient( a_uid );
    m_db_client.recordDelete( ids, loc );

    // TODO Must be durable (use DB to track delete progress)

    m_mgr.dataDelete( loc );

    PROC_MSG_END
}


bool
Worker::procCollectionDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( CollDeleteRequest, AckReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Delete record FIRST - If successful, this verifies that client has permission and ID is valid
    m_db_client.setClient( a_uid );
    vector<RepoRecordDataLocations> locs;

    for ( int i = 0; i < request->id_size(); i++ )
    {
        DL_INFO( "Collection DELETE, uid: " << a_uid << ", coll: " << request->id(i) );
        m_db_client.collDelete( request->id(i), locs );

        // TODO A crash after DB delete will leave orphaned raw data files behind, need to make durable

        // Ask FileManager to delete files
        m_mgr.dataDelete( locs );

        locs.clear();
    }

    PROC_MSG_END
}

bool
Worker::procProjectDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( ProjectDeleteRequest, AckReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Delete record FIRST - If successful, this verifies that client has permission and ID is valid
    m_db_client.setClient( a_uid );
    vector<RepoRecordDataLocations> locs;
    bool suballoc;

    for ( int i = 0; i < request->id_size(); i++ )
    {
        DL_INFO( "Project DELETE, uid: " << a_uid << ", id: " << request->id(i) );

        m_db_client.projDelete( request->id(i), locs, suballoc );

        if ( suballoc )
        {
            m_mgr.dataDelete( locs );
        }
        else
        {
            for ( vector<RepoRecordDataLocations>::iterator l = locs.begin(); l != locs.end(); ++l )
            {
                m_mgr.repoPathDelete( l->repo_id(), request->id(i) );
            }
        }

        locs.clear();
    }

    PROC_MSG_END
}

bool
Worker::procQueryDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( QueryDeleteRequest, AckReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Delete record FIRST - If successful, this verifies that client has permission and ID is valid
    m_db_client.setClient( a_uid );

    for ( int i = 0; i < request->id_size(); i++ )
    {
        //DL_INFO( "Project DELETE, uid: " << a_uid << ", id: " << request->id(i) );

        m_db_client.queryDelete( request->id(i) );
    }

    PROC_MSG_END
}

bool
Worker::procRecordSearchRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordSearchRequest, ListingReply )

    m_db_client.setClient( a_uid );
    RecordSearchRequest req2;
    DL_INFO("about to parse query[" << request->query() << "]" );
    bool use_client = false;
    bool use_shared_users = false;
    bool use_shared_projects = false;
    string q = parseQuery( request->query(), use_client, use_shared_users, use_shared_projects );
    DL_INFO("parsed query[" << q << "]" );
    req2.set_query( q );
    req2.set_use_client( use_client );
    req2.set_use_shared_users( use_shared_users );
    req2.set_use_shared_projects( use_shared_projects );

    if ( request->has_offset() )
        req2.set_offset( request->offset());

    if ( request->has_count() )
        req2.set_count( request->count());

    m_db_client.recordSearch( req2, reply );

    PROC_MSG_END
}

bool
Worker::procProjectSearchRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( ProjectSearchRequest, ProjectDataReply )

    m_db_client.setClient( a_uid );
    DL_INFO("about to parse query[" << request->text_query() << "]" );
    vector<string> scope;
    for ( int i = 0; i < request->scope_size(); i++ )
        scope.push_back( request->scope(i) );
    string q = parseProjectQuery( request->text_query(), scope );
    DL_INFO("parsed query[" << q << "]" );
    m_db_client.projSearch( q, reply );

    PROC_MSG_END
}

bool
Worker::procQueryCreateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( QueryCreateRequest, QueryDataReply )

    m_db_client.setClient( a_uid );

    QueryCreateRequest req2;
    bool use_owner = false;
    bool use_sh_usr = false;
    bool use_sh_prj = false;

    DL_INFO("about to parse query[" << request->query() << "]" );

    string q = parseQuery( request->query(), use_owner, use_sh_usr, use_sh_prj );

    DL_INFO("parsed query[" << q << "]" );

    req2.set_title( request->title());
    req2.set_query( request->query() );
    req2.set_query_comp( q );
    req2.set_use_owner( use_owner );
    req2.set_use_sh_usr( use_sh_usr );
    req2.set_use_sh_prj( use_sh_prj );

    m_db_client.queryCreate( req2, reply );

    PROC_MSG_END
}

bool
Worker::procQueryUpdateRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( QueryUpdateRequest, QueryDataReply )

    m_db_client.setClient( a_uid );
    if ( request->has_query() )
    {
        QueryUpdateRequest req2;
        bool use_owner = false;
        bool use_sh_usr = false;
        bool use_sh_prj = false;

        DL_INFO("about to parse query[" << request->query() << "]" );

        string q = parseQuery( request->query(), use_owner, use_sh_usr, use_sh_prj );

        DL_INFO("parsed query[" << q << "]" );

        if ( request->has_title() )
            req2.set_title( request->title());

        req2.set_id( request->id() );
        req2.set_query( request->query() );
        req2.set_query_comp( q );
        req2.set_use_owner( use_owner );
        req2.set_use_sh_usr( use_sh_usr );
        req2.set_use_sh_prj( use_sh_prj );

        m_db_client.queryUpdate( req2, reply );
    }
    else
    {
        m_db_client.queryUpdate( *request, reply );
    }

    PROC_MSG_END
}

bool
Worker::procRepoAllocationSetRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RepoAllocationSetRequest, AckReply )

    m_db_client.setClient( a_uid );
    m_db_client.repoAllocationSet( *request, reply );

    if ( request->max_size() > 0 )
    {
        DL_DEBUG( "Create/ensure path for " << request->subject() );
        m_mgr.repoPathCreate( request->repo(), request->subject() );
    }
    else
    {
        DL_DEBUG( "Delete path for " << request->subject() );
        m_mgr.repoPathDelete( request->repo(), request->subject() );
    }

    PROC_MSG_END
}

bool
Worker::procRepoAuthzRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( RepoAuthzRequest, AckReply )

    DL_INFO( "AuthzReq, uid: " << a_uid << ", client: " << request->client() << ", repo: " << request->repo() << ", file: " << request->file() << ", act: " << request->action() );

    m_db_client.setClient( request->client() );
    m_db_client.repoAuthz( *request, reply );

    PROC_MSG_END
}


string
Worker::parseSearchTerms( const string & a_key, const vector<string> & a_terms )
{
    vector<string> and_terms;
    vector<string> nand_terms;
    vector<string> or_terms;

    for ( vector<string>::const_iterator t = a_terms.begin(); t != a_terms.end(); ++t )
    {
        switch( (*t)[0] )
        {
        case '+':
            and_terms.push_back( (*t).substr(1) );
            break;
        case '-':
            nand_terms.push_back( (*t).substr(1) );
            break;
        default:
            or_terms.push_back( *t );
            break;
        }
    }

    string result;
    vector<string>::iterator i;

    if ( or_terms.size() > 1 )
        result += "(";

    for ( i = or_terms.begin(); i != or_terms.end(); i++ )
    {
        if ( i != or_terms.begin() )
            result += " or ";
        //if ( isPhrase( *i ) )
        result += "phrase(i['" + a_key + "'],'" + *i + "')";
        //else
        //    result += "i['" + a_key + "'] == '" + *i + "'";
    }

    if ( or_terms.size() > 1 )
        result += ")";

    for ( i = and_terms.begin(); i != and_terms.end(); i++ )
    {
        if ( result.size() )
            result += " and ";
        //if ( isPhrase( *i ) )
        result += "phrase(i['" + a_key + "'],'" + *i + "')";
        //else
        //    result += "i['" + a_key + "'] == '" + *i + "'";
    }

    for ( i = nand_terms.begin(); i != nand_terms.end(); i++ )
    {
        if ( result.size() )
            result += " and ";
        //if ( isPhrase( *i ) )
        result += "not phrase(i['" + a_key + "'],'" + *i + "')";
        //else
        //    result += "i['" + a_key + "'] != '" + *i + "'";
    }

    return "("+result+")";
}

string
Worker::parseSearchPhrase( const char * key, const string & a_phrase )
{
    // tokenize phrase on ws, comma, and semicolons - properly handling quotes
    // each token is used as a search phrase and joined based on eny prefix operators:
    //  + = AND, - = NOT, | = OR
    //vector<string> tokens = smartTokenize(a_phrase," ,;");

    string separator1("");//dont let quoted arguments escape themselves
    string separator2(" ");//split on spaces
    string separator3("\"\'");//let it have quoted arguments

    boost::escaped_list_separator<char> els(separator1,separator2,separator3);
    boost::tokenizer<boost::escaped_list_separator<char>> tok(a_phrase, els);

    vector<string>  terms;

    for(boost::tokenizer<boost::escaped_list_separator<char>>::iterator t = tok.begin(); t != tok.end(); ++t )
        terms.push_back( *t );

    return parseSearchTerms( key, terms );
}

string
Worker::parseSearchTextPhrase( const string & a_phrase )
{
    /* This function parses category logic (if present) around full-
    text queries. Text queries are typed into the text input and are
    simpler than advanced queries.Categories are title, description, and
    keywords. Categories may be specified just before query terms:

        title: fusion simulation keywords: -experiment

    If no categories are specified, all categories are searched and the
    default operator is OR for both categories and terms.

    If one or more categories are specified, the default operator for categories
    is AND but for terms it is still OR.

    Operator may be specified by prefixing category or term with:
        +   AND
        -   AND NOT

    There is no NOR operator since this would produce low-specificity queryies.

    If terms are included before a category is specified, these terms apply to all
    categories (as if they were copied as-is into each category phrase)

    Categories may only be specified once.

    Phrases are specified with single or double quotations.
    All punctuation is ignored.

    The order of categories and terms does not matter, they are grouped by operator
    in an expression such as:

        (term1 or term2 or term3) and term4 and term5 and not term6 and not term7
        OR terms                        AND terms           NAND terms
    */
    static map<string,int> cat_map =
    {
        {"t:",1},{"title:",1},
        {"d:",2},{"desc:",2},{"descr:",2},{"description:",2},
        {"k:",4},{"key:",4},{"keyw:",4},{"keyword:",4},{"keywords:",4}
    };

    string separator1("");//dont let quoted arguments escape themselves
    string separator2(" ");//split on spaces
    string separator3("\"\'");//let it have quoted arguments

    boost::escaped_list_separator<char> els(separator1,separator2,separator3);
    boost::tokenizer<boost::escaped_list_separator<char>> tok(a_phrase, els);

    string result;
    vector<string>  title,desc,keyw;
    size_t pos;
    int op = 0;
    int ops[5] = {0,0,0,0,0};
    int cat = 7;
    int count_or = 0;
    int count_other = 0;
    string op_str, extra;

    map<string,int>::const_iterator c;

    for(boost::tokenizer<boost::escaped_list_separator<char>>::iterator t = tok.begin(); t != tok.end(); ++t )
    {
        pos = (*t).find_first_of(':');
        if ( pos != string::npos )
        {
            if ( pos < (*t).size() -  1 )
            {
                op_str = (*t).substr(0,pos+1);
                extra = (*t).substr(pos+1);
            }
            else
            {
                op_str = *t;
                extra.clear();
            }

            if ( op_str[0] == '+' )
            {
                c = cat_map.find(op_str.substr(1));
                op = 2; // AND
                count_other++;
            }
            else if ( op_str[0] == '-' )
            {
                c = cat_map.find(op_str.substr(1));
                op = 3; // NAND
                count_other++;
            }
            else
            {
                c = cat_map.find(op_str);
                op = 1; // OR
                count_or++;
            }

            if ( c == cat_map.end() )
                EXCEPT_PARAM(1,"Invalid query scope '" << op_str << "'" );

            cat = c->second;

            if ( ops[cat] != 0 )
                EXCEPT_PARAM(1,"Invalid query - categories may only be specified once." );

            ops[cat] = op;

            if ( extra.size() )
            {
                if ( cat & 1 ) title.push_back( extra );
                if ( cat & 2 ) desc.push_back( extra );
                if ( cat & 4 ) keyw.push_back( extra );
            }
        }
        else
        {
            if ( cat & 1 ) title.push_back( *t );
            if ( cat & 2 ) desc.push_back( *t );
            if ( cat & 4 ) keyw.push_back( *t );
        }
    }

    // Apply default operator for unspecified categories, check for empty categories
    if ( ops[1] == 0  )
    {
        if ( title.size() )
        {
            ops[1] = 1;
            count_or++;
        }
    }
    else if ( !title.size() )
        EXCEPT(1,"Title category specified without search terms" );

    if ( ops[2] == 0 )
    {
        if ( desc.size() )
        {
            ops[2] = 1;
            count_or++;
        }
    }
    else if ( !desc.size() )
        EXCEPT(1,"Description category specified without search terms" );

    if ( ops[4] == 0 )
    {
        if ( keyw.size() )
        {
            ops[4] = 1;
            count_or++;
        }
    }
    else if ( !keyw.size() )
        EXCEPT(1,"Keywords category specified without search terms" );

    // Build OR phrase
    if ( count_or > 1 && count_other > 0 )
        result += "(";

    if ( ops[1] == 1 )
        result += parseSearchTerms( "title", title );

    if ( ops[2] == 1 )
        result += (result.size()?" or ":"") + parseSearchTerms( "desc", desc );

    if ( ops[4] == 1 )
        result += (result.size()?" or ":"") + parseSearchTerms( "keyw", keyw );

    if ( count_or > 1 && count_other > 0 )
        result += ")";

    // Build AND phrase
    if ( ops[1] == 2 )
        result += (result.size()?" and ":"") + parseSearchTerms( "title", title );

    if ( ops[2] == 2 )
        result += (result.size()?" and ":"") + parseSearchTerms( "desc", desc );

    if ( ops[4] == 2 )
        result += (result.size()?" and ":"") + parseSearchTerms( "keyw", keyw );

    // Build NAND phrase
    if ( ops[1] == 3 )
        result += (result.size()?" and not (":"not (") + parseSearchTerms( "title", title ) + ")";

    if ( ops[2] == 3 )
        result += (result.size()?" and not (":"not (") + parseSearchTerms( "desc", desc ) + ")";

    if ( ops[4] == 3 )
        result += (result.size()?" and not (":"not (") + parseSearchTerms( "keyw", keyw ) + ")";

    return result;
}

string
Worker::parseSearchIdAlias( const string & a_query )
{
    string val;
    val.resize(a_query.size());
    std::transform(a_query.begin(), a_query.end(), val.begin(), ::tolower);

    bool id_ok = true;
    bool alias_ok = true;
    size_t p;

    if (( p = val.find_first_of("/") ) != string::npos ) // Aliases cannot contain "/"
    {
        if ( p == 0 || ( p == 1 && val[0] == 'd' ))
        {
            // Minimum len of key (numbers) is 2
            if ( val.size() < p + 3 )
                return "";

            for ( string::const_iterator c = val.begin()+p+1; c != val.end(); c++ )
            {
                if ( !isdigit( *c ) )
                {
                    id_ok = false;
                    break;
                }
            }
            if ( id_ok )
                return string("i._id like \'d/") + val.substr(p+1) + "%\'";
        }

        return "";
    }

    for ( string::const_iterator c = val.begin(); c != val.end(); c++ )
    {
        // ids (keys) are only digits
        // alias are alphanum plus "_-."
        if ( !isdigit( *c ))
        {
            id_ok = false;
            if ( !isalpha( *c ) && *c != '_' && *c != '-' && *c != '.' )
            {
                alias_ok = false;
                break;
            }
        }
    }

    if ( id_ok && alias_ok )
        return string("i._id like \"%") + val + "%\" || i.alias like \"%" + val + "%\"";
    else if ( id_ok )
        return string("i._id like \"%") + val + "%\"";
    else if ( alias_ok )
        return string("i.alias like \"%") + val + "%\"";
    else
        return "";
}

string
Worker::parseSearchMetadata( const string & a_query )
{
    // Process single and double quotes (treat everything inside as part of string, until a non-escaped matching quote is found)
    // Identify supported functions as "xxx("  (allow spaces between function name and parenthesis)
    static set<string> terms = {"title","desc","alias","topic","doi","data_url","owner","creator","keyw","ct","ut","size","source","ext"};
    static set<string> funcs = {"abs","acos","asin","atan","atan2","average","avg","ceil","cos","degrees","exp","exp2",
        "floor","log","log2","log10","max","median","min","percentile","pi","pow","radians","round","sin","sqrt",
        "stddev_population","stddev_sample","sum","tan","variance_population","variance_sample",
        "date_now","length","lower","upper","distance","is_in_polygon"};
    static set<string> other = {"like","true","false","null","in"};


    struct Var
    {
        Var() : start(0), len(0) {}
        void reset() { start = 0; len = 0; }

        size_t  start;
        size_t  len;
    };

    enum ParseState
    {
        PS_DEFAULT = 0,
        PS_SINGLE_QUOTE,
        PS_DOUBLE_QUOTE,
        PS_TOKEN,
        PS_STOP
    };

    ParseState state = PS_DEFAULT;
    Var v;
    string result,tmp;
    char last = 0, next = 0, next_nws = 0;
    string::const_iterator c2;
    bool val_token, last_char = false;

    for ( string::const_iterator c = a_query.begin(); c != a_query.end(); c++ )
    {
        if ( c+1 != a_query.end() )
            next = *(c+1);
        else
            next = 0;

        next_nws = 0;
        for ( c2 = c + 1; c2 != a_query.end(); c2++ )
        {
            if ( !isspace( *c2 ))
            {
                next_nws = *c2;
                break;
            }
        }
        cout << "c[" << *c << "]\n";

        switch( state )
        {
        case PS_SINGLE_QUOTE: // Single quote (not escaped)
            if ( *c == '\'' && *(c-1) != '\\' )
                state = PS_DEFAULT;
            break;
        case PS_DOUBLE_QUOTE: // Double quote (not escaped)
            if ( *c == '\"' && *(c-1) != '\\' )
                state = PS_DEFAULT;
            break;
        case PS_DEFAULT: // Not quoted, not an identifier
            if ( *c == '\'' )
            {
                state = PS_SINGLE_QUOTE;
                cout << "single q start\n";
                break;
            }
            else if ( *c == '\"' )
            {
                state = PS_DOUBLE_QUOTE;
                cout << "dbl q start\n";
                break;
            }
            else if ( !isalpha( *c ))
                break;

            v.start = c - a_query.begin();
            cout << "tok start: " << v.start << "\n";
            v.len = 0;
            state = PS_TOKEN;
            // FALL-THROUGH to token processing
        case PS_TOKEN: // Token
            //if ( spec.find( *c ) != spec.end() )
            val_token = isalnum( *c ) || *c == '.' || *c == '_';
            last_char = (( c + 1 ) == a_query.end());

            if ( !val_token || last_char )
            {
                //cout << "start: " << v.start << ", len: " << v.len << "\n";
                if ( !val_token )
                {
                    tmp = a_query.substr( v.start, v.len );
                    if ( *c == '\'' )
                        state = PS_SINGLE_QUOTE;
                    else if ( *c == '\"' )
                        state = PS_DOUBLE_QUOTE;
                    else
                        state = PS_DEFAULT;
                }
                else
                {
                    tmp = a_query.substr( v.start, v.len + 1 );
                    state = PS_STOP;
                }
                cout << "token[" << tmp << "]" << endl;

                // Determine if identifier needs to be prefixed with "i." by testing agains allowed identifiers
                if ( tmp == "desc" )
                    result.append( "i['desc']" );
                else if ( other.find( tmp ) != other.end() || (funcs.find( tmp ) != funcs.end() && ( *c == '(' || ( isspace( *c ) && next_nws == '(' ))))
                    result.append( tmp );
                else if ( tmp == "id" )
                {
                    result.append( "i._id" );
                }
                else if ( terms.find( tmp ) != terms.end() )
                {
                    result.append( "i." );
                    result.append( tmp );
                }
                else
                {
                    if ( tmp.compare( 0, 3, "md." ) == 0 )
                        result.append( "i." );
                    else
                        result.append( "i.md." );
                    result.append( tmp );
                }

                v.reset();

            }
            else
            {
                v.len++;
            }
            break;
        default:
            break;
        }

        // Map operators to AQL: ? to LIKE, ~ to =~, = to ==

        if ( state == PS_STOP )
            break;
        else if ( state == PS_DEFAULT )
        {
            if ( *c == '?' )
                result += " like ";
            else if ( *c == '~' )
                if ( last != '=' )
                    result += "=~";
                else
                    result += '~';
            else if ( *c == '=' )
                if ( last != '=' && last != '<' && last != '>' && last != '!' && next != '~' && next != '=' )
                    result += "==";
                else
                    result += '=';
            else
                result += *c;
        }
        else if ( state != PS_TOKEN )
            result += *c;

        last = *c;
    }

    if ( state == PS_SINGLE_QUOTE || state == PS_DOUBLE_QUOTE )
    {
        EXCEPT(1,"Mismatched quotation marks in query" );
    }

    //cout << "[" << a_query << "]=>[" << result << "]\n";
    return result;
}


string
Worker::parseQuery( const string & a_query, bool & use_client, bool & use_shared_users, bool & use_shared_projects )
{
    use_client = false;

    rapidjson::Document query;

    query.Parse( a_query.c_str() );

    if ( query.HasParseError() )
    {
        rapidjson::ParseErrorCode ec = query.GetParseError();
        EXCEPT_PARAM( 1, "Invalid query: " << rapidjson::GetParseError_En( ec ));
    }

    string phrase;
    rapidjson::Value::MemberIterator imem = query.FindMember("text");
    if ( imem != query.MemberEnd() )
    {
        phrase = parseSearchTextPhrase( imem->value.GetString() );
    }
    else
    {
        rapidjson::Value::MemberIterator imem = query.FindMember("title");
        if ( imem != query.MemberEnd() )
            phrase = parseSearchPhrase( "title", imem->value.GetString() );

        imem = query.FindMember("desc");
        if ( imem != query.MemberEnd() )
        {
            if ( phrase.size() )
                phrase += " or ";
            phrase += parseSearchPhrase( "desc", imem->value.GetString() );
        }

        imem = query.FindMember("keyw");
        if ( imem != query.MemberEnd() )
        {
            if ( phrase.size() )
                phrase += " or ";
            phrase += parseSearchPhrase( "keyw", imem->value.GetString() );
        }
    }

    string id;
    imem = query.FindMember("id");
    if ( imem != query.MemberEnd() )
    {
        id = parseSearchIdAlias( imem->value.GetString() );
        DL_INFO("ID search: " << id );
        if ( !id.size() )
            EXCEPT(1,"Invalid ID/Alias query value.");
    }

    string meta;
    imem = query.FindMember("meta");
    if ( imem != query.MemberEnd() )
    {
        meta = parseSearchMetadata( imem->value.GetString() );
    }

    if ( meta.size() && id.size() )
    {
        meta = string("(") + id + ") && (" + meta + ")";
    }
    else if ( id.size() )
    {
        meta = id;
    }

    string result;

    if ( phrase.size() )
        result += string("for i in intersection((for i in textview search analyzer(") + phrase + ",'text_en') return i),(";

    imem = query.FindMember("scopes");
    if ( imem == query.MemberEnd() )
        EXCEPT(1,"No query scope provided");

    int scope;
    rapidjson::Value::MemberIterator imem2;

    if ( imem->value.Size() > 1 )
        result += "for i in union((";

    bool inc_ret = false;
    if ( imem->value.Size() > 1 || phrase.size() )
        inc_ret = true;

    for ( rapidjson::SizeType i = 0; i < imem->value.Size(); i++ )
    {
        if ( i > 0 )
            result += "),(";

        rapidjson::Value & val = imem->value[i];
        imem2 = val.FindMember("scope");
        if ( imem2 == val.MemberEnd() )
            EXCEPT(1,"Missing scope value");
        scope = imem2->value.GetUint();

        switch( scope )
        {
        case SDMS::SS_USER:
            result += "for i in 1..1 inbound @client owner filter is_same_collection('d',i)";
            use_client = true;
            break;
        case SDMS::SS_PROJECT:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for project");
            result += string("for i in 1..1 inbound '") + imem2->value.GetString() + "' owner filter is_same_collection('d',i)";
            break;
        case SDMS::SS_OWNED_PROJECTS:
            result += "for i,e,p in 2..2 inbound @client owner filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i)";
            use_client = true;
            break;
        case SDMS::SS_MANAGED_PROJECTS:
            result += "for i,e,p in 2..2 inbound @client admin filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i)";
            use_client = true;
            break;
        case SDMS::SS_MEMBER_PROJECTS:
            result += "for i,e,p in 3..3 inbound @client member, any owner filter p.vertices[1].gid == 'members' and IS_SAME_COLLECTION('p',p.vertices[2]) and IS_SAME_COLLECTION('d',i)";
            use_client = true;
            break;
        case SDMS::SS_COLLECTION:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for collection");
            result += string("for i in 1..10 outbound '") + imem2->value.GetString() + "' item filter is_same_collection('d',i)";
            break;
        case SDMS::SS_TOPIC:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for topic");
            result += string("for i in 1..10 inbound '") + imem2->value.GetString() + "' top, outbound item filter is_same_collection('d',i)";
            break;
        case SDMS::SS_SHARED_BY_USER:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for shared user");
            //result += "for i in 1..1 inbound " + imem2->value.GetString() + " owner filter IS_SAME_COLLECTION('d',i) return i";
            use_client = true;
            result += string("for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner == '") + imem2->value.GetString() + "' return v),"
                "(for v,e,p in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner == '" + imem2->value.GetString() + "' return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner == '" + imem2->value.GetString() + "' return v)"
                ")";
            break;
        case SDMS::SS_SHARED_BY_ANY_USER:
            //result += "for u in @shared_users for i in 1..1 inbound u owner filter IS_SAME_COLLECTION('d',i) return i";
            use_client = true;
            use_shared_users = true;
            result += "for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner in @users return v),"
                "(for v,e,p in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner in @users return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner in @users return v)"
                ")";
            break;
        case SDMS::SS_SHARED_BY_PROJECT:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for shared project");
            use_client = true;
            result += string("for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner == '") + imem2->value.GetString() + "' return v),"
                "(for v,e,p in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner == '" + imem2->value.GetString() + "' return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner == '" + imem2->value.GetString() + "' return v)"
                ")";
            break;
        case SDMS::SS_SHARED_BY_ANY_PROJECT:
            use_shared_projects = true;
            result += "for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner in @projs return v),"
                "(for v,e,p in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner in @projs return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner in @projs return v)"
                ")";
            break;
        case SDMS::SS_PUBLIC:
            result += "for i in d filter i.public == true and i.owner != @client";
            use_client = true;
            break;
        case SDMS::SS_VIEW:
            break;
        }

        if ( inc_ret )
            result += " return i";
    }

    if ( imem->value.Size() > 1 )
    {
        result += "))";
        if ( phrase.size() )
            result += " return i";
    }

    if ( phrase.size() )
        result += "))";

    if ( meta.size() )
        result += " filter " + meta;

    result += " limit @offset, @count return {id:i._id,title:i.title,alias:i.alias,locked:i.locked,owner:i.owner,doi:i.doi}";


    return result;
}


string
Worker::parseProjectQuery( const string & a_text_query, const vector<string> & a_scope )
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

}}
