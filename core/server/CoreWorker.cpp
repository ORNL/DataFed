#include <iostream>
#include <atomic>
#include <CoreWorker.hpp>
#include <TraceException.hpp>
#include <DynaLog.hpp>
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

#define SET_MSG_HANDLER(proto_id,msg,func)  cout << "set handler " << ((proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg ))<< "\n"; m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func
#define SET_MSG_HANDLER_DB(proto_id,rq,rp,func) cout << "set db handler " << ((proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #rq )) << "\n"; m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #rq )] = &Worker::dbPassThrough<rq,rp,&DatabaseClient::func>

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

        proto_id = REG_PROTO( SDMS::Auth );

        // Requests that require the server to take action
        SET_MSG_HANDLER( proto_id, GenerateCredentialsRequest, &Worker::procGenerateCredentialsRequest );
        SET_MSG_HANDLER( proto_id, SSH_GenerateKeysRequest, &Worker::procSSH_GenerateKeysRequest );
        SET_MSG_HANDLER( proto_id, SSH_GetPublicKeyRequest, &Worker::procSSH_GetPublicKeyRequest );
        SET_MSG_HANDLER( proto_id, DataGetRequest, &Worker::procDataGetRequest  );
        SET_MSG_HANDLER( proto_id, DataPutRequest, &Worker::procDataPutRequest  );
        SET_MSG_HANDLER( proto_id, DataDeleteRequest, &Worker::procDataDeleteRequest );
        SET_MSG_HANDLER( proto_id, RecordDeleteRequest, &Worker::procRecordDeleteRequest );

        // Requests that can be handled by DB client directly
        SET_MSG_HANDLER_DB( proto_id, UserViewRequest, UserDataReply, userView );
        SET_MSG_HANDLER_DB( proto_id, UserUpdateRequest, UserDataReply, userUpdate );
        SET_MSG_HANDLER_DB( proto_id, UserListRequest, UserDataReply, userList );
        SET_MSG_HANDLER_DB( proto_id, UserFindByUUIDsRequest, UserDataReply, userFindByUUIDs );
        SET_MSG_HANDLER_DB( proto_id, RecordListRequest, RecordDataReply, recordList );
        SET_MSG_HANDLER_DB( proto_id, RecordViewRequest, RecordDataReply, recordView );
        SET_MSG_HANDLER_DB( proto_id, RecordFindRequest, RecordDataReply, recordFind );
        SET_MSG_HANDLER_DB( proto_id, RecordCreateRequest, RecordDataReply, recordCreate );
        SET_MSG_HANDLER_DB( proto_id, RecordUpdateRequest, RecordDataReply, recordUpdate );
        SET_MSG_HANDLER_DB( proto_id, CollListRequest, CollDataReply, collList );
        SET_MSG_HANDLER_DB( proto_id, CollCreateRequest, CollDataReply, collCreate );
        SET_MSG_HANDLER_DB( proto_id, CollUpdateRequest, CollDataReply, collUpdate );
        SET_MSG_HANDLER_DB( proto_id, CollViewRequest, CollDataReply, collView );
        SET_MSG_HANDLER_DB( proto_id, CollReadRequest, CollDataReply, collRead );
        SET_MSG_HANDLER_DB( proto_id, CollWriteRequest, AckReply, collWrite );
        SET_MSG_HANDLER_DB( proto_id, XfrViewRequest, XfrDataReply, xfrView );
        SET_MSG_HANDLER_DB( proto_id, XfrListRequest, XfrDataReply, xfrList );
        SET_MSG_HANDLER_DB( proto_id, ACLViewRequest, ACLDataReply, aclView );
        SET_MSG_HANDLER_DB( proto_id, ACLUpdateRequest, ACLDataReply, aclUpdate );
        SET_MSG_HANDLER_DB( proto_id, GroupCreateRequest, GroupDataReply, groupCreate );
        SET_MSG_HANDLER_DB( proto_id, GroupUpdateRequest, GroupDataReply, groupUpdate );
        SET_MSG_HANDLER_DB( proto_id, GroupDeleteRequest, AckReply, groupDelete );
        SET_MSG_HANDLER_DB( proto_id, GroupListRequest, GroupDataReply, groupList );
        SET_MSG_HANDLER_DB( proto_id, GroupViewRequest, GroupDataReply, groupView );
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

    MsgComm         comm( "inproc://workers", ZMQ_DEALER, false );
    uint16_t        msg_type;
    map<uint16_t,msg_fun_t>::iterator handler;

    while ( m_run )
    {
        try
        {
            if ( comm.recv( m_msg_buf, 1000 ))
            {
                msg_type = m_msg_buf.getMsgType();

                //cout << "W" << m_tid << " got msg " << msg_type << endl;
                DL_INFO( "W"<<m_tid<<" recvd msg type: " << msg_type );

                handler = m_msg_handlers.find( msg_type );
                if ( handler != m_msg_handlers.end() )
                {
                    DL_INFO( "W"<<m_tid<<" calling handler" );

                    if ( (this->*handler->second)())
                    {
                        comm.send( m_msg_buf );
                    }
                }
                else
                    DL_ERROR( "W"<<m_tid<<" recvd unregistered msg type: " << msg_type );
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
cout << "unserialize msg" << endl;\
::google::protobuf::Message *base_msg = m_msg_buf.unserialize(); \
if ( base_msg ) \
{ \
    cout << "got msg ptr" << endl;\
    request = dynamic_cast<msgclass*>( base_msg ); \
    if ( request ) \
    { \
        /*DL_INFO( "Rcvd: " << request->DebugString());*/ \
        replyclass reply; \
        try \
        { cout << "about to call handler" << endl;

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
Worker::dbPassThrough()
{
    PROC_MSG_BEGIN( RQ, RP )
    cout << "Calling DB handler " << func << endl;
    (m_db_client.*func)( *request, reply );

    PROC_MSG_END
}

bool
Worker::procStatusRequest()
{
    cout << "procStatusRequest\n";
    PROC_MSG_BEGIN( StatusRequest, StatusReply )

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}

bool
Worker::procAuthenticateRequest()
{
    PROC_MSG_BEGIN( AuthenticateRequest, AckReply )

    PROC_MSG_END
}

bool
Worker::procGenerateCredentialsRequest()
{
    PROC_MSG_BEGIN( GenerateCredentialsRequest, GenerateCredentialsReply )

    PROC_MSG_END
}

bool
Worker::procSSH_GenerateKeysRequest()
{
    PROC_MSG_BEGIN( SSH_GenerateKeysRequest, SSH_PublicKeyReply )

    PROC_MSG_END
}

bool
Worker::procSSH_GetPublicKeyRequest()
{
    PROC_MSG_BEGIN( SSH_GetPublicKeyRequest, SSH_PublicKeyReply )

    PROC_MSG_END
}

bool
Worker::procDataGetRequest()
{
    PROC_MSG_BEGIN( DataGetRequest, XfrDataReply )

    PROC_MSG_END
}

bool
Worker::procDataPutRequest()
{
    PROC_MSG_BEGIN( DataPutRequest, XfrDataReply )

    PROC_MSG_END
}

bool
Worker::procDataDeleteRequest()
{
    PROC_MSG_BEGIN( DataDeleteRequest, AckReply )

    PROC_MSG_END
}

bool
Worker::procRecordDeleteRequest()
{
    PROC_MSG_BEGIN( RecordDeleteRequest, RecordDeleteReply )

    PROC_MSG_END
}

}}
