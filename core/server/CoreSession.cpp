#include <iostream>
#include <fstream>
#include "DynaLog.hpp"
#include "CoreSession.hpp"
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace Core {

asio::ip::tcp::no_delay no_delay_on(true);
asio::ip::tcp::no_delay no_delay_off(false);

#define NO_DELAY_ON(sock) sock.lowest_layer().set_option(no_delay_on)
#define NO_DELAY_OFF(sock) sock.lowest_layer().set_option(no_delay_off)


#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func
#define SET_MSG_HANDLER_DB(proto_id,rq,rp,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #rq )] = &Session::dbPassThrough<rq,rp,&DatabaseClient::func>

map<uint16_t,Session::msg_fun_t> Session::m_msg_handlers;


Session::Session( asio::io_service & a_io_service, asio::ssl::context& a_context, ISessionMgr & a_sess_mgr, const std::string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass ) :
    m_sess_mgr( a_sess_mgr ),
    m_socket( a_io_service, a_context ),
    m_anon(true),
    m_in_buf( 4096 ),
    m_db_client(a_db_url,a_db_user,a_db_pass)
{
    Session::setupMsgHandlers();

    //m_socket.set_verify_mode( asio::ssl::verify_peer | asio::ssl::verify_fail_if_no_peer_cert );
    m_socket.set_verify_mode( asio::ssl::verify_peer );
    m_socket.set_verify_callback( bind( &Session::verifyCert, this, placeholders::_1, placeholders::_2 ));

    cout << "ctor(" << this << "), m_anon: " << m_anon << "\n";
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

        SET_MSG_HANDLER( proto_id, StatusRequest, &Session::procMsgStatus );
        SET_MSG_HANDLER( proto_id, AuthenticateRequest, &Session::procMsgAuthenticate );

        proto_id = REG_PROTO( SDMS::Auth );

        // Requests that require the server to take action
        //SET_MSG_HANDLER( proto_id, SetLocalIdentityRequest, &Session::procMsgSetLocalIdentity );
        SET_MSG_HANDLER( proto_id, GenerateCredentialsRequest, &Session::procMsgGenerateCredentials );
        SET_MSG_HANDLER( proto_id, GenerateKeysRequest, &Session::procMsgGenerateKeys );
        SET_MSG_HANDLER( proto_id, GetPublicKeyRequest, &Session::procMsgGetPublicKey );
        SET_MSG_HANDLER( proto_id, DataGetRequest, &Session::procMsgDataGet  );
        SET_MSG_HANDLER( proto_id, DataPutRequest, &Session::procMsgDataPut  );
        SET_MSG_HANDLER( proto_id, DataDeleteRequest, &Session::procMsgDataDelete );
        SET_MSG_HANDLER( proto_id, RecordDeleteRequest, &Session::procMsgRecordDelete );

        // Requests that can be handled by DB client directly
        SET_MSG_HANDLER_DB( proto_id, UserViewRequest, UserDataReply, userView );
        SET_MSG_HANDLER_DB( proto_id, UserUpdateRequest, UserDataReply, userUpdate );
        SET_MSG_HANDLER_DB( proto_id, UserListRequest, UserDataReply, userList );
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
}


void
Session::start()
{
    clock_gettime( CLOCK_REALTIME, &m_last_access );

    auto self( shared_from_this() );

    m_socket.async_handshake( asio::ssl::stream_base::server,
        [this,self]( error_code ec )
        {
            if ( ec )
                handleCommError( "Handshake failed: ", ec );
            else
            {
                cout << "anon: " << m_anon << "\n";

                m_db_client.setClient( m_client_id );
                readMsgHeader();
            }
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


double
Session::lastAccessTime()
{
    return m_last_access.tv_sec + (m_last_access.tv_nsec*1e-9);
}


void
Session::handleCommError( const std::string & a_msg, error_code a_ec )
{
    if ( a_ec )
        DL_ERROR( a_msg << a_ec.category().name() << "[" << a_ec.value() << "] " << a_ec.message() );

    m_sess_mgr.sessionClosed( shared_from_this() );

    // Setting time to 0 will cause session to be garbaged collected
    //m_last_access.tv_sec = 0;
    //m_last_access.tv_nsec = 0;
}


bool
Session::verifyCert( bool a_preverified, asio::ssl::verify_context & a_context )
{
    char subject_buf[256];

    X509* cert = X509_STORE_CTX_get_current_cert( a_context.native_handle() );
    X509_NAME_oneline( X509_get_subject_name( cert ), subject_buf, 256 );

    string subject = subject_buf;

    cout << "verify cert: " << subject << ", pre ver: " << a_preverified << "\n";

    size_t pos = subject.rfind("/CN=SDMS-");

    if ( pos != string::npos )
    {
        // This is a user cert
        m_client_id = subject.substr( pos + 9 );
        cout << "uid: " << m_client_id << "\n";

        m_anon = false;
    }

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
            {
                clock_gettime( CLOCK_REALTIME, &m_last_access );

                readMsgBody();
            }
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
    {
        // Anonymous user can only send SetupRequest message
        if ( m_anon && msg_type > 0x1FF )
        {
            DL_ERROR( "Anonymous user sent msg type: " << msg_type );

            Anon::NackReply nack;
            nack.set_err_code( ID_AUTHN_REQUIRED );
            nack.set_err_msg( "Anonymous users have restricted API access" );
            m_out_buf.serialize( nack );
            m_out_buf.getFrame().context = m_in_buf.getFrame().context;
            writeMsgHeader();
        }
        else
        {
            (this->*handler->second)();
        }
    }
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
                {
                    NO_DELAY_OFF(m_socket);
                }
            });
    }
    else
    {
        NO_DELAY_OFF(m_socket);
    }
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
Session::procMsgAuthenticate()
{
    PROC_MSG_BEGIN( AuthenticateRequest, AckReply )

    // Note: uid is the user's SDMS account name, not posix uid
    m_db_client.setClient( request->uid() );
    m_db_client.clientAuthenticate( request->password() );

    m_client_id = request->uid();
    m_anon = false;

    PROC_MSG_END
}


void
Session::procMsgStatus()
{
    PROC_MSG_BEGIN( Anon::StatusRequest, Anon::StatusReply )

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}

/*
void
Session::procMsgSetLocalIdentity()
{
    PROC_MSG_BEGIN( SetLocalIdentityRequest, Anon::AckReply )

    // Ensure client has an identity for local environment
    m_db_client.clientLinkIdentity( m_sess_mgr.getUnit() + "." + request->ident() );

    // Switch to POSIX identity
    m_uid = request->ident();
    m_db_client.setClient( m_sess_mgr.getUnit() + "." + m_uid );

    PROC_MSG_END
}
*/

/** @brief Creates identity for local environment and generate matching credentials
 *
 * This method configures a local environment for non- interactive SDMS use.
 * An identity matching the facility and POSIX uid of the client is generated
 * and linked, and x509 certificates are generated and stored on the server
 * side. The public certificate is returned to the client for installation and
 * subsequent use.
 */
void
Session::procMsgGenerateCredentials()
{
    PROC_MSG_BEGIN( GenerateCredentialsRequest, GenerateCredentialsReply )

    // TODO need a private place to put these temp files

    string key_file = "/tmp/" + m_client_id + "-key.pem";
    string cert_file = "/tmp/" + m_client_id + "-cert.pem";
    string csr_file = "/tmp/" + m_client_id + ".csr";

    try
    {
        string cmd = "openssl genrsa -out " + key_file + " 2048";
        if ( system( cmd.c_str() ))
            EXCEPT( ID_SERVICE_ERROR, "Client key generation failed." );

        cmd = "openssl req -new -key " + key_file + " -subj /C=US/O=DOE/OU=ASCR/CN=SDMS-" + m_client_id + " -out " + csr_file;
        if ( system( cmd.c_str() ))
            EXCEPT( ID_SERVICE_ERROR, "CSR generation failed." );

        cmd = "openssl x509 -req -in " + csr_file + " -CA " + m_sess_mgr.getCertFile() + " -CAkey " + m_sess_mgr.getKeyFile() + " -CAcreateserial -out " + cert_file + " -days 1024 -sha256";
        if ( system( cmd.c_str() ))
            EXCEPT( ID_SERVICE_ERROR, "Certificate generation failed." );

        ifstream inf( cert_file );
        if ( !inf.is_open() || !inf.good() )
            EXCEPT( ID_SERVICE_ERROR, "Could not open new cert file" );

        string data(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());
        inf.close();

        cout << "New cert [" << data << "]\n";

        reply.set_x509_cert( data );

        inf.open( key_file );
        if ( !inf.is_open() || !inf.good() )
            EXCEPT( ID_SERVICE_ERROR, "Could not open new key file" );

        data.assign(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());
        inf.close();

        cout << "New key [" << data << "]\n";

        reply.set_x509_key( data );

        remove( key_file.c_str() );
        remove( cert_file.c_str() );
        remove( csr_file.c_str() );
    }
    catch(...)
    {
        remove( key_file.c_str() );
        remove( cert_file.c_str() );
        remove( csr_file.c_str() );
        throw;
    }

    PROC_MSG_END
}


void
Session::procMsgGenerateKeys()
{
    PROC_MSG_BEGIN( SSH_GenerateKeysRequest, SSH_PublicKeyReply )

    string key_data;

    m_sess_mgr.generateKeys( m_client_id, key_data );

    reply.set_pub_key( key_data );

    PROC_MSG_END
}


void
Session::procMsgGetPublicKey()
{
    PROC_MSG_BEGIN( SSH_GetPublicKeyRequest, SSH_PublicKeyReply )

    string key_data;

    m_sess_mgr.getPublicKey( m_client_id, key_data );

    reply.set_pub_key( key_data );

    PROC_MSG_END
}


void
Session::procMsgDataGet()
{
    PROC_MSG_BEGIN( DataGetRequest, XfrDataReply )

    // 1. Resolve ID/Alias to data ID
    // 2. Verify client has R/W permission
    // 3. Get source path
    // 4. Get client globus ID
    // 5. Calculate client SSH keyfile
    // 6. Create transfer record in DB
    // 7. Start Globus transfer - capture task ID
    // 8. Update transfer record with task ID

    m_db_client.xfrInit( request->id(), request->local(), XM_GET, reply );

    if ( reply.xfr_size() != 1 )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid data returned from DB service" );

    m_sess_mgr.handleNewXfr( reply.xfr(0), m_client_id );

    PROC_MSG_END
}


void
Session::procMsgDataPut()
{
    PROC_MSG_BEGIN( DataPutRequest, XfrDataReply )

    m_db_client.xfrInit( request->id(), request->local(), XM_PUT, reply );

    if ( reply.xfr_size() != 1 )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid data returned from DB service" );

    m_sess_mgr.handleNewXfr( reply.xfr(0), m_client_id );

    PROC_MSG_END
}


void
Session::procMsgDataDelete()
{
    PROC_MSG_BEGIN( DataDeleteRequest, AckReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Get data ID (req ID might be an alias)
    Auth::RecordUpdateRequest upd_req;
    Auth::RecordDataReply upd_reply;

    upd_req.set_id( request->id() );
    upd_req.set_data_size( 0 );

    m_db_client.recordUpdate( upd_req, upd_reply );

    // Ask FileManager to delete file
    m_sess_mgr.dataDelete( request->id() );

    PROC_MSG_END
}


void
Session::procMsgRecordDelete()
{
    PROC_MSG_BEGIN( RecordDeleteRequest, RecordDeleteReply )

    // TODO Acquire write lock here
    // TODO Need better error handling (plus retry)

    // Delete record FIRST - If successful, this verifies that client has permission and ID is valid
    m_db_client.recordDelete( *request, reply );

    // Ask FileManager to delete file
    m_sess_mgr.dataDelete( reply.id() );

    PROC_MSG_END
}


template<typename RQ, typename RP, void (DatabaseClient::*func)( const RQ &, RP &)>
void
Session::dbPassThrough()
{
    PROC_MSG_BEGIN( RQ, RP )

    (m_db_client.*func)( *request, reply );

    PROC_MSG_END
}

}}
