#include <iostream>
#include <fstream>
#include <boost/filesystem.hpp>
#include "DynaLog.hpp"
#include "RepoSession.hpp"
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace Repo {

asio::ip::tcp::no_delay no_delay_on(true);
asio::ip::tcp::no_delay no_delay_off(false);

#define NO_DELAY_ON(sock) sock.lowest_layer().set_option(no_delay_on)
#define NO_DELAY_OFF(sock) sock.lowest_layer().set_option(no_delay_off)


#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func
#define SET_MSG_HANDLER_DB(proto_id,rq,rp,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #rq )] = &Session::dbPassThrough<rq,rp,&CentralDatabaseClient::func>

map<uint16_t,Session::msg_fun_t> Session::m_msg_handlers;


Session::Session( asio::io_service & a_io_service, asio::ssl::context& a_context, ISessionMgr & a_sess_mgr ) :
    m_sess_mgr( a_sess_mgr ),
    m_socket( a_io_service, a_context ),
    m_in_buf( 4096 )
{
    Session::setupMsgHandlers();

    //m_socket.set_verify_mode( asio::ssl::verify_peer | asio::ssl::verify_fail_if_no_peer_cert );
    m_socket.set_verify_mode( asio::ssl::verify_peer );
    m_socket.set_verify_callback( bind( &Session::verifyCert, this, placeholders::_1, placeholders::_2 ));
}


Session::~Session()
{
    cout << "Session " << this << " deleted\n";
}


void
Session::setupMsgHandlers()
{
    static bool init = true;

    if ( init )
    {
        init = false;

        uint8_t proto_id = REG_PROTO( SDMS::Anon );
        SET_MSG_HANDLER( proto_id, StatusRequest, &Session::procStatusRequest );

        proto_id = REG_PROTO( SDMS::Auth );
        SET_MSG_HANDLER( proto_id, RepoDataDeleteRequest, &Session::procDataDeleteRequest );
    }
}


void
Session::start()
{
    auto self( shared_from_this() );

    m_socket.async_handshake( asio::ssl::stream_base::server,
        [this,self]( error_code ec )
        {
            if ( ec )
                handleCommError( "Handshake failed: ", ec );
            else
                readMsgHeader();
        });
}


void
Session::close()
{
    m_socket.lowest_layer().close();
}


string
Session::remoteAddress()
{
    asio::ip::tcp::endpoint ep = m_socket.lowest_layer().remote_endpoint();

    return ep.address().to_string() + ":" + to_string( ep.port() );
}


asio::basic_socket<asio::ip::tcp, asio::stream_socket_service<asio::ip::tcp> > &
Session::getSocket()
{
    return m_socket.lowest_layer();
}



void
Session::handleCommError( const std::string & a_msg, error_code a_ec )
{
    if ( a_ec )
        DL_ERROR( a_msg << a_ec.category().name() << "[" << a_ec.value() << "] " << a_ec.message() );

    m_sess_mgr.sessionClosed( shared_from_this() );
}


bool
Session::verifyCert( bool a_preverified, asio::ssl::verify_context & a_context )
{
    char subject_buf[256];

    X509* cert = X509_STORE_CTX_get_current_cert( a_context.native_handle() );
    X509_NAME_oneline( X509_get_subject_name( cert ), subject_buf, 256 );

    string subject = subject_buf;

    cout << "verify cert: " << subject << ", pre-verified: " << a_preverified << "\n";

    return a_preverified;
}


void
Session::readMsgHeader()
{
    //cout << "Session::readMsgHeader\n";

    auto self( shared_from_this() );

    asio::async_read( m_socket, asio::buffer( (char*)&m_in_buf.getFrame(), sizeof( MsgBuf::Frame )),
        [this,self]( error_code ec, size_t )
        {
            if ( ec )
                handleCommError( "readMsgHeader: ", ec );
            else
                readMsgBody();
        });
}


void
Session::readMsgBody()
{
    //cout << "Session::readMsgBody\n";

    if ( m_in_buf.getFrame().size )
    {
        auto self( shared_from_this() );

        asio::async_read( m_socket, asio::buffer( m_in_buf.getBuffer(), m_in_buf.getFrame().size ),
            [this,self]( error_code ec, size_t )
            {
                if ( ec )
                    handleCommError( "readMsgBody: ", ec );
                else
                    messageHandler();
            });
    }
    else
    {
        messageHandler();
    }
}


void
Session::messageHandler()
{
    uint16_t msg_type = m_in_buf.getMsgType();
    map<uint16_t,msg_fun_t>::iterator handler = m_msg_handlers.find( msg_type );

    //cout << "Get msg type: " << msg_type << "\n";

    if ( handler != m_msg_handlers.end() )
        (this->*handler->second)();
    else
        DL_ERROR( "Recv unregistered msg type: " << msg_type );

    readMsgHeader();
}


void
Session::writeMsgHeader()
{
    //cout << "Session::writeMsgHeader\n";
    
    if ( m_out_buf.getFrame().size == 0 )
        NO_DELAY_ON(m_socket);

    auto self( shared_from_this() );

    asio::async_write( m_socket, asio::buffer( (char*)&m_out_buf.getFrame(), sizeof( MsgBuf::Frame )),
        [this,self]( error_code ec, size_t )
        {
            if ( ec )
                handleCommError( "readMsgBody: ", ec );
            else if ( m_out_buf.getFrame().size )
                writeMsgBody();

            NO_DELAY_OFF(m_socket);
        });
}


void
Session::writeMsgBody()
{
    //cout << "Session::writeMsgBody\n";

    if ( m_out_buf.getFrame().size )
    {
        NO_DELAY_ON(m_socket);

        auto self( shared_from_this() );

        asio::async_write( m_socket, asio::buffer( m_out_buf.getBuffer(), m_out_buf.getFrame().size ),
            [this,self]( error_code ec, size_t )
            {
                if ( ec )
                    handleCommError( "writeMsgBody: ", ec );
                else
                    NO_DELAY_OFF(m_socket);
            });
    }
    else
        NO_DELAY_OFF(m_socket);
}


#define PROC_MSG_BEGIN( msgclass, replyclass ) \
msgclass *request = 0; \
::google::protobuf::Message *base_msg = m_in_buf.unserialize(); \
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
            m_out_buf.serialize( reply ); \
        } \
        catch( TraceException &e ) \
        { \
            DL_WARN( "Session "<<this<<" " << e.toString() ); \
            NackReply nack; \
            nack.set_err_code( (ErrorCode) e.getErrorCode() ); \
            nack.set_err_msg( e.toString() ); \
            m_out_buf.serialize( nack ); \
        } \
        catch( exception &e ) \
        { \
            DL_WARN( "Session "<<this<<" " << e.what() ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( e.what() ); \
            m_out_buf.serialize( nack ); \
        } \
        catch(...) \
        { \
            DL_WARN( "Session "<<this<<" unkown exception while processing message!" ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( "Unknown exception type" ); \
            m_out_buf.serialize( nack ); \
        } \
        m_out_buf.getFrame().context = m_in_buf.getFrame().context; \
        writeMsgHeader(); \
        DL_TRACE( "Sent: " << reply.DebugString()); \
    } \
    else { \
        DL_ERROR( "Session "<<this<<": dynamic cast of msg buffer " << &m_in_buf << " failed!" );\
    } \
    delete base_msg; \
} \
else { \
    DL_ERROR( "Session "<<this<<": buffer parse failed due to unregistered msg type." ); \
}


void
Session::procStatusRequest()
{
    PROC_MSG_BEGIN( Anon::StatusRequest, Anon::StatusReply )

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}


void
Session::procDataDeleteRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataDeleteRequest, Anon::AckReply )

    boost::filesystem::path data_path(  m_sess_mgr.getDataPath( request->id() ) );

    if ( boost::filesystem::remove( data_path ))
    {
        // Errors are OK (file may not exist under some conditions)
    }

    PROC_MSG_END
}


void
Session::procDataGetSizeRequest()
{
    PROC_MSG_BEGIN( Auth::RepoDataGetSizeRequest, Auth::RepoDataSizeReply )

    boost::filesystem::path data_path( m_sess_mgr.getDataPath( request->id() ));

    if ( boost::filesystem::exists( data_path ))
    {
        reply.set_size( boost::filesystem::file_size( data_path ));
    }

    PROC_MSG_END
}

}}
