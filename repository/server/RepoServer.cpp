#include <fstream>
#include <time.h>
#include <boost/filesystem.hpp>
#include "DynaLog.hpp"
#include "RepoServer.hpp"
#include "Exec.hpp"

#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"


#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))

#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 300
#define INIT_POLL_PERIOD 1
#define MAX_BACKOFF 10

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace SDMS {
namespace Repo {

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func


Server::Server( uint32_t a_port ) :
    m_port( a_port ),
    m_io_running( false )
{
    uint8_t proto_id = REG_PROTO( SDMS::Anon );

    SET_MSG_HANDLER( proto_id, StatusRequest, &Server::procStatusRequest );

    proto_id = REG_PROTO( SDMS::Auth );

    SET_MSG_HANDLER( proto_id, RepoDataDeleteRequest, &Server::procDataDeleteRequest );
    SET_MSG_HANDLER( proto_id, RepoDataGetSizeRequest, &Server::procDataGetSizeRequest );
}


Server::~Server()
{
}


void
Server::run( bool a_async )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
        throw runtime_error( "Only one worker router instance allowed" );

    m_io_running = true;

    if ( a_async )
    {
        m_io_thread = new thread( &Server::ioRun, this );
    }
    else
    {
        lock.unlock();
        ioRun();
        lock.lock();
        m_io_running = false;
        m_router_cvar.notify_all();
    }
}


void
Server::stop( bool a_wait )
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
    {
        // TODO Need another way to terminate ZMQ threads
        //zmq_ctx_term( m_zmq_ctx );

        if ( a_wait )
        {
            if ( m_io_thread )
            {
                m_io_thread->join();
                delete m_io_thread;

                m_io_thread = 0;
                m_io_running = false;
            }
            else
            {
                while( m_io_running )
                    m_router_cvar.wait( lock );
            }
        }
    }
}


void
Server::wait()
{
    unique_lock<mutex> lock(m_api_mutex);

    if ( m_io_running )
    {
        if ( m_io_thread )
        {
            m_io_thread->join();
            delete m_io_thread;

            m_io_thread = 0;
            m_io_running = false;
        }
        else
        {
            while( m_io_running )
                m_router_cvar.wait( lock );
        }
    }
}


void
Server::ioRun()
{
    DL_INFO( "io thread started" );

    MsgComm::SecurityContext sec_ctx;
    sec_ctx.is_server = false;
    sec_ctx.public_key = "B8Bf9bleT89>9oR/EO#&j^6<F6g)JcXj0.<tMc9[";
    sec_ctx.private_key = "k*m3JEK{Ga@+8yDZcJavA*=[<rEa7>x2I>3HD84U";
    sec_ctx.server_key = "B8Bf9bleT89>9oR/EO#&j^6<F6g)JcXj0.<tMc9[";

    MsgComm sysComm( string("tcp://*:") + to_string(m_port), ZMQ_ROUTER, true, &sec_ctx );

    MsgComm test( string("tcp://localhost:9001"), ZMQ_DEALER, false, 0 );
    StatusRequest stat_req;
    MsgBuf::Message * msg;
    MsgBuf::Frame frame;
    test.send( stat_req );
    if ( !test.recv( msg, frame, 5000 ))
    {
        cout << "Core server did not respond\n";
    }
    else
    {
        cout << "Core server responded with " << frame.getMsgType() << "\n";
    }

    uint16_t msg_type;
    map<uint16_t,msg_fun_t>::iterator handler;

    while ( 1 )
    {
        try
        {
            if ( sysComm.recv( m_msg_buf, 2000 ))
            {
                msg_type = m_msg_buf.getMsgType();

                //cout << "Get msg type: " << msg_type << "\n";

                handler = m_msg_handlers.find( msg_type );
                if ( handler != m_msg_handlers.end() )
                {
                    (this->*handler->second)();
                    sysComm.send( m_msg_buf );
                }
                else
                {
                    DL_ERROR( "Recv unregistered msg type: " << msg_type );
                }
            }
        }
        catch( ... )
        {
            DL_ERROR( "Exception in msg handler" );
        }
    }

    DL_INFO( "io thread stopped" );
}



string
Server::getDataPath( const string & a_data_id )
{
    return string( "/data/" ) + a_data_id.substr(2);
}


#define PROC_MSG_BEGIN( msgclass, replyclass ) \
msgclass *request = 0; \
::google::protobuf::Message *base_msg = m_msg_buf.unserialize(); \
if ( base_msg ) \
{ \
    request = dynamic_cast<msgclass*>( base_msg ); \
    if ( request ) \
    { \
        DL_TRACE( "Rcvd: " << request->DebugString()); \
        replyclass reply; \
        try \
        {

#define PROC_MSG_END \
            m_msg_buf.serialize( reply ); \
        } \
        catch( TraceException &e ) \
        { \
            DL_WARN( e.toString() ); \
            NackReply nack; \
            nack.set_err_code( (ErrorCode) e.getErrorCode() ); \
            nack.set_err_msg( e.toString() ); \
            m_msg_buf.serialize( nack ); \
        } \
        catch( exception &e ) \
        { \
            DL_WARN( e.what() ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( e.what() ); \
            m_msg_buf.serialize( nack ); \
        } \
        catch(...) \
        { \
            DL_WARN( "unkown exception while processing message!" ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( "Unknown exception type" ); \
            m_msg_buf.serialize( nack ); \
        } \
    } \
    else { \
        DL_ERROR( "dynamic cast of msg buffer failed!" );\
    } \
    delete base_msg; \
} \
else { \
    DL_ERROR( "buffer parse failed due to unregistered msg type." ); \
}


void
Server::procStatusRequest()
{
    PROC_MSG_BEGIN( Anon::StatusRequest, Anon::StatusReply )

    cout << "Repo: status request\n";

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}


void
Server::procDataDeleteRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataDeleteRequest, Anon::AckReply )

    cout << "Repo: data delete request " << request->id() << "\n";

    boost::filesystem::path data_path(  getDataPath( request->id() ) );

    cout << "Repo: path " << data_path << "\n";

    boost::filesystem::remove( data_path );

    PROC_MSG_END
}


void
Server::procDataGetSizeRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataGetSizeRequest, Auth::RepoDataSizeReply )

    cout << "Repo: data get size request " << request->id() << "\n";

    boost::filesystem::path data_path( getDataPath( request->id() ));

    cout << "Repo: path " << data_path << "\n";

    reply.set_id( request->id() );

    if ( boost::filesystem::exists( data_path ))
    {
        reply.set_size( boost::filesystem::file_size( data_path ));
        cout << "Repo: size: " << reply.size() << "\n";
    }
    else
    {
        reply.set_size( 0 );
        cout << "Repo: path does not exist\n";
    }

    PROC_MSG_END
}




}}
