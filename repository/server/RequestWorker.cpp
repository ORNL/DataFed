#include <iostream>
#include <atomic>
#include <boost/filesystem.hpp>
//#include <boost/tokenizer.hpp>
#include <RequestWorker.hpp>
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

namespace Repo {


map<uint16_t,RequestWorker::msg_fun_t> RequestWorker::m_msg_handlers;


RequestWorker::RequestWorker( size_t a_tid ) :
    m_config(Config::getInstance()), m_tid(a_tid), m_worker_thread(0), m_run(true)
{
    setupMsgHandlers();
    m_worker_thread = new thread( &RequestWorker::workerThread, this );
}

RequestWorker::~RequestWorker()
{
    stop();
    wait();
}

void
RequestWorker::stop()
{
    m_run = false;
}

void
RequestWorker::wait()
{
    if ( m_worker_thread )
    {
        m_worker_thread->join();
        delete m_worker_thread;
        m_worker_thread = 0;
    }
}

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[MsgBuf::findMessageType( proto_id, #msg )] = func

void
RequestWorker::setupMsgHandlers()
{
    static std::atomic_flag lock = ATOMIC_FLAG_INIT;

    if ( lock.test_and_set() )
        return;

    try
    {
        uint8_t proto_id = REG_PROTO( SDMS::Anon );

        SET_MSG_HANDLER( proto_id, StatusRequest, &RequestWorker::procStatusRequest );
        SET_MSG_HANDLER( proto_id, VersionRequest, &RequestWorker::procVersionRequest );

        proto_id = REG_PROTO( SDMS::Auth );

        SET_MSG_HANDLER( proto_id, RepoDataDeleteRequest, &RequestWorker::procDataDeleteRequest );
        SET_MSG_HANDLER( proto_id, RepoDataGetSizeRequest, &RequestWorker::procDataGetSizeRequest );
        SET_MSG_HANDLER( proto_id, RepoPathCreateRequest, &RequestWorker::procPathCreateRequest );
        SET_MSG_HANDLER( proto_id, RepoPathDeleteRequest, &RequestWorker::procPathDeleteRequest );
    }
    catch( TraceException & e)
    {
        DL_ERROR( "RequestWorker::setupMsgHandlers, exception: " << e.toString() );
        throw;
    }
}


void
RequestWorker::workerThread()
{
    DL_DEBUG( "W" << m_tid << " thread started" );

    MsgComm     comm( "inproc://workers", MsgComm::DEALER, false );
    uint16_t    msg_type;
    map<uint16_t,msg_fun_t>::iterator   handler;

    while ( m_run )
    {
        try
        {
            if ( comm.recv( m_msg_buf, true, 1000 ))
            {
                msg_type = m_msg_buf.getMsgType();

                // DEBUG - Inject random delay in message processing
                if ( m_tid & 1 )
                {
                    //int delay = (rand() % 2000)*1000;
                    //usleep( delay );
                    DL_DEBUG( "W" << m_tid << " sleeping" );
                    sleep( 30 );
                }

                DL_DEBUG( "W" << m_tid << " recvd msg type: " << msg_type );

                handler = m_msg_handlers.find( msg_type );
                if ( handler != m_msg_handlers.end() )
                {
                    DL_DEBUG( "W"<<m_tid<<" calling handler" );

                    (this->*handler->second)();
                    comm.send( m_msg_buf );

                    DL_DEBUG( "W" << m_tid << " reply sent." );
                }
                else
                {
                    DL_ERROR( "W" << m_tid << " recvd unregistered msg type: " << msg_type );
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

    DL_DEBUG( "W" << m_tid << " thread exiting" );
}


#define PROC_MSG_BEGIN( msgclass, replyclass ) \
msgclass *request = 0; \
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
            m_msg_buf.serialize( reply ); \
        } \
        catch( TraceException &e ) \
        { \
            DL_ERROR( "W"<<m_tid<<" " << e.toString() ); \
            NackReply nack; \
            nack.set_err_code( (ErrorCode) e.getErrorCode() ); \
            nack.set_err_msg( e.toString( true ) ); \
            m_msg_buf.serialize( nack );\
        } \
        catch( exception &e ) \
        { \
            DL_ERROR( "W"<<m_tid<<" " << e.what() ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( e.what() ); \
            m_msg_buf.serialize( nack ); \
        } \
        catch(...) \
        { \
            DL_ERROR( "W"<<m_tid<<" unkown exception while processing message!" ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( "Unknown exception type" ); \
            m_msg_buf.serialize( nack ); \
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
}



void
RequestWorker::procStatusRequest()
{
    PROC_MSG_BEGIN( Anon::StatusRequest, Anon::StatusReply )

    DL_DEBUG( "Status request" );

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}

void
RequestWorker::procVersionRequest()
{
    PROC_MSG_BEGIN( VersionRequest, VersionReply )

    DL_DEBUG( "Version request" );

    reply.set_major( VER_MAJOR );
    reply.set_mapi_major( VER_MAPI_MAJOR );
    reply.set_mapi_minor( VER_MAPI_MINOR );
    reply.set_server( VER_SERVER );
    reply.set_client( VER_CLIENT );

    PROC_MSG_END
}

void
RequestWorker::procDataDeleteRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataDeleteRequest, Anon::AckReply )

    for ( int i = 0; i < request->loc_size(); i++ )
    {
        boost::filesystem::path data_path( request->loc(i).path() );
        DL_DEBUG( "Delete " << data_path );
        boost::filesystem::remove( data_path );
    }

    PROC_MSG_END
}


void
RequestWorker::procDataGetSizeRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataGetSizeRequest, Auth::RepoDataSizeReply )

    DL_DEBUG( "Data get size" );

    RecordDataSize * data_sz;

    for ( int i = 0; i < request->loc_size(); i++ )
    {
        const RecordDataLocation & item = request->loc(i);
        boost::filesystem::path data_path( item.path() );

        data_sz = reply.add_size();
        data_sz->set_id( item.id() );

        if ( boost::filesystem::exists( data_path ))
        {
            data_sz->set_size( boost::filesystem::file_size( data_path ));
        }
        else
        {
            data_sz->set_size( 0 );
            DL_ERROR( "DataGetSizeReq - path does not exist: "  << item.path() );
        }
    }

    PROC_MSG_END
}


void
RequestWorker::procPathCreateRequest()
{
    PROC_MSG_BEGIN( Auth::RepoPathCreateRequest, Anon::AckReply )

    DL_DEBUG( "Path create request " << request->path() );

    boost::filesystem::path data_path( request->path() );
    if ( !boost::filesystem::exists( data_path ))
    {
        boost::filesystem::create_directory( data_path );
    }

    PROC_MSG_END
}


void
RequestWorker::procPathDeleteRequest()
{
    PROC_MSG_BEGIN( Auth::RepoPathDeleteRequest, Anon::AckReply )

    DL_DEBUG( "Path delete request " << request->path() );

    boost::filesystem::path data_path( request->path() );
    if ( boost::filesystem::exists( data_path ))
    {
        boost::filesystem::remove_all( data_path );
    }

    PROC_MSG_END
}


}}