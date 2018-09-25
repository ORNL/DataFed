#include <iostream>
#include <atomic>
#include <CoreWorker.hpp>
#include <TraceException.hpp>
#include <DynaLog.hpp>
#include <Util.hpp>
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

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func
#define SET_MSG_HANDLER_DB(proto_id,rq,rp,func) m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #rq )] = &Worker::dbPassThrough<rq,rp,&DatabaseClient::func>

void
Worker::setupMsgHandlers()
{
    static std::atomic_flag lock = ATOMIC_FLAG_INIT;

    if ( lock.test_and_set() )
        return;

    try
    {
        cout << "setup worker msg handlers\n";

        uint8_t proto_id = REG_PROTO( SDMS::Anon );

        SET_MSG_HANDLER( proto_id, StatusRequest, &Worker::procStatusRequest );
        SET_MSG_HANDLER( proto_id, AuthenticateRequest, &Worker::procAuthenticateRequest );
        SET_MSG_HANDLER( proto_id, GetAuthStatusRequest, &Worker::procGetAuthStatusRequest );

        proto_id = REG_PROTO( SDMS::Auth );

        // Requests that require the server to take action
        SET_MSG_HANDLER( proto_id, GenerateCredentialsRequest, &Worker::procGenerateCredentialsRequest );
        SET_MSG_HANDLER( proto_id, RevokeCredentialsRequest, &Worker::procRevokeCredentialsRequest );
        SET_MSG_HANDLER( proto_id, DataGetRequest, &Worker::procDataGetRequest );
        SET_MSG_HANDLER( proto_id, DataPutRequest, &Worker::procDataPutRequest );
        SET_MSG_HANDLER( proto_id, DataCopyRequest, &Worker::procDataCopyRequest );
        SET_MSG_HANDLER( proto_id, DataDeleteRequest, &Worker::procDataDeleteRequest );
        SET_MSG_HANDLER( proto_id, RecordDeleteRequest, &Worker::procRecordDeleteRequest );
        SET_MSG_HANDLER( proto_id, RecordSearchRequest, &Worker::procRecordSearchRequest );
        SET_MSG_HANDLER( proto_id, CollDeleteRequest, &Worker::procCollectionDeleteRequest );
        SET_MSG_HANDLER( proto_id, RepoAllocationSetRequest, &Worker::procRepoAllocationSetRequest );

        // Requests that can be handled by DB client directly
        
        SET_MSG_HANDLER_DB( proto_id, CheckPermsRequest, CheckPermsReply, checkPerms );
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
        SET_MSG_HANDLER_DB( proto_id, ProjectDeleteRequest, AckReply, projDelete );
        SET_MSG_HANDLER_DB( proto_id, ProjectViewRequest, ProjectDataReply, projView );
        SET_MSG_HANDLER_DB( proto_id, ProjectListRequest, ProjectDataReply, projList );
        SET_MSG_HANDLER_DB( proto_id, RecordViewRequest, RecordDataReply, recordView );
        SET_MSG_HANDLER_DB( proto_id, RecordCreateRequest, RecordDataReply, recordCreate );
        SET_MSG_HANDLER_DB( proto_id, RecordUpdateRequest, RecordDataReply, recordUpdate );
        SET_MSG_HANDLER_DB( proto_id, RecordGetDataLocationRequest, RecordDataLocationReply, recordGetDataLocation );
        SET_MSG_HANDLER_DB( proto_id, CollListRequest, CollDataReply, collList );
        SET_MSG_HANDLER_DB( proto_id, CollCreateRequest, CollDataReply, collCreate );
        SET_MSG_HANDLER_DB( proto_id, CollUpdateRequest, CollDataReply, collUpdate );
        SET_MSG_HANDLER_DB( proto_id, CollViewRequest, CollDataReply, collView );
        SET_MSG_HANDLER_DB( proto_id, CollReadRequest, ListingReply, collRead );
        SET_MSG_HANDLER_DB( proto_id, CollWriteRequest, ListingReply, collWrite );
        SET_MSG_HANDLER_DB( proto_id, CollGetParentsRequest, CollDataReply, collGetParents );
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
        SET_MSG_HANDLER_DB( proto_id, RepoUpdateRequest, AckReply, repoUpdate );
        SET_MSG_HANDLER_DB( proto_id, RepoListAllocationsRequest, RepoAllocationsReply, repoListAllocations );
        SET_MSG_HANDLER_DB( proto_id, RepoListUserAllocationsRequest, RepoAllocationsReply, repoListUserAllocations );
        SET_MSG_HANDLER_DB( proto_id, RepoListProjectAllocationsRequest, RepoAllocationsReply, repoListProjectAllocations );
        SET_MSG_HANDLER_DB( proto_id, RepoListOwnerAllocationsRequest, RepoAllocationsReply, repoListOwnerAllocations );
        SET_MSG_HANDLER_DB( proto_id, RepoAllocationStatsRequest, RepoAllocationStatsReply, repoAllocationStats );
    }
    catch( TraceException & e)
    {
        DL_ERROR( e.toString() );
        throw;
    }
}


void
Worker::workerThread()
{
    cout << "W" << m_tid << " started" << endl;

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
            if ( comm.recv( m_msg_buf, 1000 ))
            {
                msg_type = m_msg_buf.getMsgType();

                DL_INFO( "W"<<m_tid<<" recvd msg type: " << msg_type << " from ["<< m_msg_buf.getUID() <<"]" );

                if ( strncmp( m_msg_buf.getUID().c_str(), "anon_", 5 ) == 0 && msg_type > 0x1FF )
                {
                    DL_INFO( "W"<<m_tid<<" unauthorized access" );
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
        DL_INFO( "Rcvd: " << request->DebugString()); \
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
Worker::procAuthenticateRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( AuthenticateRequest, AckReply )

    m_db_client.setClient( request->uid() );
    m_db_client.clientAuthenticate( request->password() );

    cout << "Authenticated " << request->uid() << "\n";
    m_mgr.authorizeClient( a_uid, request->uid() );

    PROC_MSG_END
}

bool
Worker::procGetAuthStatusRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( GetAuthStatusRequest, GetAuthStatusReply )

    if ( strncmp( a_uid.c_str(), "anon_", 5 ) == 0 )
    {
        reply.set_auth( false );
    }
    else
    {
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

    PROC_MSG_END
}


bool
Worker::procRevokeCredentialsRequest( const std::string & a_uid )
{
    (void)a_uid;
    PROC_MSG_BEGIN( RevokeCredentialsRequest, AckReply )

    m_db_client.setClient( a_uid );
    m_db_client.userClearKeys();

    PROC_MSG_END
}


bool
Worker::procDataGetRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataGetRequest, XfrDataReply )

    m_db_client.setClient( a_uid );
    m_db_client.xfrInit( request->id(), request->local(), XM_GET, reply );

    if ( reply.xfr_size() != 1 )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid data returned from DB service" );

    m_mgr.handleNewXfr( reply.xfr(0) );

    PROC_MSG_END
}

bool
Worker::procDataPutRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataPutRequest, XfrDataReply )

    m_db_client.setClient( a_uid );
    m_db_client.xfrInit( request->id(), request->local(), XM_PUT, reply );

    if ( reply.xfr_size() != 1 )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid data returned from DB service" );

    m_mgr.handleNewXfr( reply.xfr(0) );

    PROC_MSG_END
}

bool
Worker::procDataCopyRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataCopyRequest, XfrDataReply )

    m_db_client.setClient( a_uid );
    m_db_client.xfrInit( request->source_id(), request->dest_id(), XM_COPY, reply );

    if ( reply.xfr_size() != 1 )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid data returned from DB service" );

    m_mgr.handleNewXfr( reply.xfr(0) );

    PROC_MSG_END
}

bool
Worker::procDataDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( DataDeleteRequest, AckReply )

    Auth::RecordUpdateRequest upd_req;
    Auth::RecordDataReply upd_reply;

    upd_req.set_id( request->id() );
    upd_req.set_data_size( 0 );

    m_db_client.setClient( a_uid );
    m_db_client.recordUpdate( upd_req, upd_reply );

    Auth::RecordGetDataLocationRequest loc_req;
    Auth::RecordDataLocationReply loc_reply;
    loc_req.set_id( request->id() );
    m_db_client.recordGetDataLocation( loc_req, loc_reply );

    // Ask manager to delete file
    for ( int i = 0; i < loc_reply.location_size(); i++ )
    {
        const RecordDataLocation & loc = loc_reply.location(i);
        m_mgr.dataDelete( loc.repo_id(), loc.path() );
    }

    PROC_MSG_END
}


bool
Worker::procRecordDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordDeleteRequest, RecordDataLocationReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Delete record FIRST - If successful, this verifies that client has permission and ID is valid
    m_db_client.setClient( a_uid );
    m_db_client.recordDelete( *request, reply );

    // Ask FileManager to delete file(s)
    for ( int i = 0; i < reply.location_size(); i++ )
    {
        const RecordDataLocation & loc = reply.location(i);
        m_mgr.dataDelete( loc.repo_id(), loc.path() );
    }

    PROC_MSG_END
}

bool
Worker::procCollectionDeleteRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( CollDeleteRequest, RecordDataLocationReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Delete record FIRST - If successful, this verifies that client has permission and ID is valid
    m_db_client.setClient( a_uid );
    m_db_client.collDelete( *request, reply );

    // Ask FileManager to delete file
    for ( int i = 0; i < reply.location_size(); i++ )
    {
        const RecordDataLocation & loc = reply.location(i);
        m_mgr.dataDelete( loc.repo_id(), loc.path() );
    }

    PROC_MSG_END
}

bool
Worker::procRecordSearchRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RecordSearchRequest, ListingReply )

    m_db_client.setClient( a_uid );
    RecordSearchRequest req2;
    req2.set_query( parseQuery( request->query() ));
    if ( request->has_scope())
        req2.set_scope( request->scope() );
    m_db_client.recordSearch( req2, reply );

    PROC_MSG_END
}

bool
Worker::procRepoAllocationSetRequest( const std::string & a_uid )
{
    PROC_MSG_BEGIN( RepoAllocationSetRequest, AckReply )

    m_db_client.setClient( a_uid );
    m_db_client.repoAllocationSet( *request, reply );
    cout << "procRepoAllocationSetRequest, alloc: " << request->alloc() << endl;
    if ( request->alloc() > 0 )
    {
        cout << "create path!\n";
        m_mgr.repoPathCreate( request->repo(), request->subject() );
    }
    else
    {
        cout << "delete path!\n";
        m_mgr.repoPathDelete( request->repo(), request->subject() );
    }

    PROC_MSG_END
}

}}
