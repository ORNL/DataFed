#include "Client.hpp"
#include <iostream>
#include <fstream>
#include <stdexcept>
#include <boost/filesystem.hpp>


asio::ip::tcp::no_delay no_delay_on(true);
asio::ip::tcp::no_delay no_delay_off(false);

//#define NO_DELAY_ON(sock) (void)0
//#define NO_DELAY_OFF(sock) (void)0
#define NO_DELAY_ON(sock) sock->lowest_layer().set_option(no_delay_on)
#define NO_DELAY_OFF(sock) sock->lowest_layer().set_option(no_delay_off)

#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>

#include "Exec.hpp"

#include <time.h>

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))


using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace Facility {

//typedef std::shared_ptr<Auth::ResolveXfrReply> spResolveXfrReply;

bool
Client::verifyCredentials( const std::string & a_cred_path, const std::string & a_unit )
{
    char * uid = getlogin();
    if ( uid == 0 )
        EXCEPT( 0, "Could not determine login name" );

    boost::system::error_code ec;
    boost::filesystem::path dest_path( a_cred_path + uid + "-" + a_unit + "-cert.pem" );

    // TODO Need a way to actually check to see if the content of these credentials is valid

    if ( !boost::filesystem::exists( dest_path, ec ) )
        return false;

    dest_path = a_cred_path + uid + "-" + a_unit + "-key.pem";
    if ( !boost::filesystem::exists( dest_path, ec ) )
        return false;

    return true;
}


Client::Client( const std::string & a_host, uint32_t a_port, uint32_t a_timeout, const std::string & a_cred_path, const std::string & a_unit, bool a_load_certs ) :
    m_host( a_host ),
    m_port( a_port ),
    m_cred_path( a_cred_path ),
    m_unit(a_unit),
    m_resolver( m_io_service ),
    m_context( asio::ssl::context::tlsv12 ),
    m_socket( 0 ),
    m_io_thread( 0 ),
    m_timeout( a_timeout ),
    m_ctx( 1 ),
    m_state(NOT_STARTED)
{
    REG_PROTO( SDMS::Anon );
    REG_PROTO( SDMS::Auth );

    char * uid = getlogin();
    if ( uid == 0 )
        EXCEPT( 0, "Could not determine login name" );

    m_uid = uid;

    if ( m_cred_path.size() && *m_cred_path.rbegin() != '/' )
        m_cred_path += "/";

    //m_context.add_verify_path("/etc/ssl/certs");

    // TODO - This must be configurable
    m_context.load_verify_file( m_cred_path + "sdmsd-" + a_unit + "-cert.pem");
    

    m_cert_file = m_cred_path + m_uid + "-" + a_unit + "-cert.pem";
    m_key_file = m_cred_path + m_uid + "-" + a_unit + "-key.pem";

    if ( a_load_certs )
    {
        m_context.use_certificate_file( m_cert_file, asio::ssl::context::pem );
        m_context.use_private_key_file( m_key_file , asio::ssl::context::pem );
    }

    m_socket = new ssl_socket( m_io_service, m_context );

    m_socket->set_verify_mode( asio::ssl::verify_peer | asio::ssl::verify_fail_if_no_peer_cert );
    m_socket->set_verify_callback( bind( &Client::verifyCert, this, placeholders::_1, placeholders::_2 ));
}

Client::~Client()
{
    stop();

    delete m_socket;
}

void Client::start()
{
    auto endpoint_iterator = m_resolver.resolve({ m_host, to_string( m_port ) });

    connect( endpoint_iterator );

    m_io_thread = new thread([this](){ m_io_service.run(); });
    
    // Wait for handshake to complete
    unique_lock<mutex> lock(m_mutex);
    while( m_state == NOT_STARTED )
        m_start_cvar.wait( lock );

    if ( m_state == FAILED )
        EXCEPT( 1, "Failed to connect to server" );
        
    ServerInfoRequest req;
    ServerInfoReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    m_country = reply->country();
    m_org = reply->org();
    m_unit = reply->unit();

    delete reply;
}

void Client::stop()
{
    if ( m_state == STARTED )
    {
        error_code ec;
        m_socket->lowest_layer().cancel( ec );
        m_socket->shutdown( ec );
        m_state = NOT_STARTED;
    }
}

void Client::connect( asio::ip::tcp::resolver::iterator endpoint_iterator )
{
    asio::async_connect( m_socket->lowest_layer(), endpoint_iterator,
        [this]( error_code ec, asio::ip::tcp::resolver::iterator )
        {
            if (!ec)
            {
                asio::socket_base::keep_alive option(true);
                m_socket->lowest_layer().set_option(option);

                handShake();
            }
            else
            {
                cerr << "Connect failed: " << ec.message() << "\n";

                unique_lock<mutex> lock(m_mutex);
                m_state = FAILED;
                m_start_cvar.notify_all();
            }
        });
}

void Client::handShake()
{
    m_socket->async_handshake( asio::ssl::stream_base::client,
        [this]( error_code ec )
        {
            unique_lock<mutex> lock(m_mutex);
            if ( !ec )
            {
                m_state = STARTED;
            }
            else
            {
                cerr << "Handshake failed: " << ec.message() << endl;
                m_state = FAILED;
            }

            m_start_cvar.notify_all();
        });
}

bool Client::verifyCert( bool a_preverified, asio::ssl::verify_context & a_context )
{
    (void)a_preverified;

    char subject_name[256];

    X509* cert = X509_STORE_CTX_get_current_cert( a_context.native_handle() );
    X509_NAME_oneline( X509_get_subject_name( cert ), subject_name, 256 );

    return a_preverified;
}


template<typename RQT,typename RPT>
void Client::send( RQT & a_request, RPT *& a_reply, uint16_t a_context )
{
    //cout << "send\n";

    a_reply = 0;
    m_out_buf.getFrame().context = a_context;
    m_out_buf.serialize( a_request );

    //cout << "out msg body sz: " << m_out_buf.getFrame().size << "\n";
    if ( m_out_buf.getFrame().size == 0 )
        NO_DELAY_ON(m_socket);

    error_code ec;

    //cout << "1" << endl;

    uint32_t len = asio::write( *m_socket, asio::buffer( (char*)&m_out_buf.getFrame(), sizeof( MsgBuf::Frame )), ec );
    
    if ( ec )
    {
        cerr << "write err: " << ec.category().name() << "[" << ec.value() << "] " << ec.message() << endl;
    }

    if ( len != sizeof( MsgBuf::Frame ))
        EXCEPT( 1, "Write header failed" );

    //cout << "sent header, len: " << len << "\n";

    if ( m_out_buf.getFrame().size == 0 )
        NO_DELAY_OFF(m_socket);
    else
    {
        NO_DELAY_ON(m_socket);

        //cout << "2" << endl;

        len = asio::write( *m_socket, asio::buffer( m_out_buf.getBuffer(), m_out_buf.getFrame().size ));
        if ( len != m_out_buf.getFrame().size )
            EXCEPT( 1, "Write body failed" );

        //cout << "sent body, len: " << len << "\n";

        NO_DELAY_OFF(m_socket);
    }

    //cout << "3" << endl;

    len = asio::read( *m_socket, asio::buffer( (char*)&m_in_buf.getFrame(), sizeof( MsgBuf::Frame )));
    if ( len != sizeof( MsgBuf::Frame ))
        EXCEPT( 1, "Read header failed" );

    //cout << "rcv header, len: " << len << "\n";
    if ( m_in_buf.getFrame().size )
    {
        //cout << "4" << endl;

        //cout << "need more: " << m_in_buf.getFrame().size << "\n";
        m_in_buf.ensureCapacity( m_in_buf.getFrame().size );
        len = asio::read( *m_socket, asio::buffer( m_in_buf.getBuffer(), m_in_buf.getFrame().size ));
        if ( len != m_in_buf.getFrame().size )
            EXCEPT( 1, "Read body failed" );
        //cout << "rcv body, len: " << len << "\n";
    }

    if ( m_in_buf.getFrame().context != a_context )
        EXCEPT_PARAM( 1, "Reply context mismatch. Expected " << a_context << " got " << m_in_buf.getFrame().context );

    MsgBuf::Message * raw_reply = m_in_buf.unserialize();
    //cout << "msg: " << raw_reply << "\n";
    if (( a_reply = dynamic_cast<RPT *>( raw_reply )) == 0 )
    {
        Anon::NackReply * nack = dynamic_cast<Anon::NackReply *>( raw_reply );
        if ( nack )
        {
            uint32_t ec = nack->err_code();
            string msg;
            if ( nack->has_err_msg() )
                msg = nack->err_msg();

            delete raw_reply;
            EXCEPT( ec, msg );
        }

        delete raw_reply;
        EXCEPT_PARAM( 0, "Unexpected reply from server, msg_type: " << m_in_buf.getMsgType() );
    }
    //cout << "a_reply: " << a_reply << "\n";
}

string Client::setup()
{
    setLocalIdentity();
    generateCredentials();

    return generateKeys();
}

void Client::setLocalIdentity()
{
    SetLocalIdentityRequest req;
    Anon::AckReply *        rep;

    req.set_ident( m_uid );

    send<>( req, rep, m_ctx++ );

    delete rep;
}


void Client::generateCredentials()
{
    GenerateCredentialsRequest req;
    GenerateCredentialsReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    try
    {
        //cout << "Saving " << m_key_file << "\n";
        ofstream outf( m_key_file );
        if ( !outf.is_open() || !outf.good() )
            EXCEPT_PARAM( 0, "Could not open " << m_key_file << " for write" );

        outf << reply->x509_key();
        outf.close();

        //cout << "Saving " << m_cert_file << "\n";
        outf.open( m_cert_file );
        if ( !outf.is_open() || !outf.good() )
            EXCEPT_PARAM( 0, "Could not open " << m_cert_file << " for write" );

        outf << reply->x509_cert();
        outf.close();

        delete reply;
    }
    catch(...)
    {
        delete reply;
        throw;
    }
}

/*
void Client::generateKeys( const std::string & a_outfile )
{
    ofstream  outf( a_outfile );
    if ( !outf.is_open() || !outf.good() )
        EXCEPT_PARAM( 0, "Could not open " << a_outfile << " for output" );

    GenerateKeysRequest req;
    PublicKeyReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    outf << reply->pub_key();
    outf.close();

    delete reply;
}
*/

std::string Client::generateKeys()
{
    GenerateKeysRequest req;
    PublicKeyReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    string result = reply->pub_key();

    delete reply;
    return result;
}

/*
void Client::getPublicKey( const std::string & a_outfile )
{
    ofstream  outf( a_outfile );
    if ( !outf.is_open() || !outf.good() )
        EXCEPT_PARAM( 0, "Could not open " << a_outfile << " for output" );

    GetPublicKeyRequest req;
    PublicKeyReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    outf << reply->pub_key();
    outf.close();

    delete reply;
}
*/

std::string Client::sshPublicKey()
{
    GetPublicKeyRequest req;
    PublicKeyReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    string result = reply->pub_key();

    delete reply;
    return result;
}

bool Client::test( size_t a_iter )
{
    Anon::StatusReply     in;
    Anon::StatusReply *   out = 0;
    MsgBuf::Message *       raw;
    MsgBuf          buf;

    for ( size_t i = 0; i < a_iter; ++i )
    {
        in.set_status( SS_NORMAL );
        buf.serialize( in );
        raw = buf.unserialize();
        if ( !raw )
        {
            cerr << "unserialize failed\n";
            return false;
        }
        out = dynamic_cast<Anon::StatusReply *>(raw);
        if ( !out )
        {
            cerr << "cast failed\n";
            delete raw;
            return false;
        }
        delete raw;
    }
    return true;
}


ServiceStatus Client::status()
{
    //cout << "status\n";

    Anon::StatusRequest req;
    Anon::StatusReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    ServiceStatus stat = reply->status();

    delete reply;

    return stat;
}

void
Client::authenticate( const std::string & a_uid, const string & a_password )
{
    /*
    char * uid = getlogin();
    if ( uid == 0 )
        EXCEPT( 0, "Could not determine login name" );
    */

    AuthenticateRequest req;

    req.set_uid( a_uid );
    req.set_password( a_password );

    AckReply * reply;

cout << "sending\n";
    send<>( req, reply, m_ctx++ );
cout << "back\n";

    delete reply;
}

spUserDataReply
Client::userView( const string & a_uid, bool a_details )
{
    Auth::UserViewRequest req;
    Auth::UserDataReply * reply;

    req.set_uid( a_uid );
    if ( a_details )
        req.set_details( true );

    send<>( req, reply, m_ctx++ );

    return spUserDataReply( reply );
}

spUserDataReply
Client::userList( bool a_details, uint32_t a_offset, uint32_t a_count )
{
    Auth::UserListRequest req;
    Auth::UserDataReply * reply;

    if ( a_details )
        req.set_details( a_details );
    if ( a_offset )
        req.set_offset( a_offset );
    if ( a_count )
        req.set_count( a_count );

    send<>( req, reply, m_ctx++ );

    return spUserDataReply( reply );
}

spUserDataReply
Client::userUpdate( const std::string & a_uid, const char * a_name, const char * a_email, const char * a_globus_id )
{
    Auth::UserUpdateRequest req;
    Auth::UserDataReply *   reply;

    req.set_uid( a_uid );

    if ( a_name )
        req.set_name( a_name );
    if ( a_email )
        req.set_email( a_email );
    if ( a_globus_id )
        req.set_globus_id( a_globus_id );

    send<>( req, reply, m_ctx++ );

    return spUserDataReply( reply );
}

string
Client::parseQuery( const string & a_query )
{
    static set<char> spec = {'(',')',' ','\t','\\','+','-','/','*','<','>','=','!','~','&','|','?'};
    static set<char> nums = {'0','1','2','3','4','5','6','7','8','9','.'};

    struct Var
    {
        Var() : start(0), len(0) {}
        void reset() { start = 0; len = 0; }

        size_t  start;
        size_t  len;
    };

    int state = 0;
    Var v;
    string result;
    string tmp;

    for ( string::const_iterator c = a_query.begin(); c != a_query.end(); ++c )
    {
        switch( state )
        {
        case 0: // Not quoted
            if ( spec.find( *c ) == spec.end() )
            {
                if ( nums.find( *c ) == nums.end() )
                {
                    if ( *c == '\'' )
                        state = 1;
                    else if ( *c == '\"' )
                        state = 2;
                    else
                    {
                        v.start = c - a_query.begin();
                        //cout << "start: " << v.start << "\n";
                        v.len = 1;
                        state = 3;
                    }
                }
            }
            break;
        case 1: // Single quote
            if ( *c == '\'' )
                state = 0;
            break;
        case 2: // Double quote
            if ( *c == '\"' )
                state = 0;
            break;
        case 3: // Identifier
            if ( spec.find( *c ) != spec.end() )
            {
                //cout << "start: " << v.start << ", len: " << v.len << "\n";
                tmp = a_query.substr( v.start, v.len );
                if ( tmp != "true" && tmp != "false" )
                {
                    result.append( "i.md." );
                }
                result.append( tmp );
                v.reset();
                state = 0;
            }
            else
                v.len++;
            break;
        }

        if ( state == 0 && *c == '?' )
            result += "LIKE";
        else if ( state != 3 )
            result += *c;
    }

    //cout << "[" << a_query << "]=>[" << result << "]\n";
    return result;
}

spRecordDataReply
Client::recordList()
{
    Auth::RecordListRequest req;
    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}

spRecordDataReply
Client::recordFind( const std::string & a_query )
{
    Auth::RecordFindRequest req;

    req.set_query( parseQuery( a_query ));

    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}

spRecordDataReply
Client::recordView( const std::string & a_id )
{
    Auth::RecordViewRequest req;
    req.set_id( a_id );

    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}

spRecordDataReply
Client::recordCreate( const std::string & a_title, const char * a_desc, const char * a_alias, const char * a_metadata, const char * a_proj_id, const char * a_coll_id )
{
    Auth::RecordCreateRequest req;

    req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );
    if ( a_metadata )
        req.set_metadata( a_metadata );
    if ( a_proj_id )
        req.set_proj_id( a_proj_id );
    if ( a_coll_id )
        req.set_coll_id( a_coll_id );

    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}

spRecordDataReply
Client::recordUpdate( const std::string & a_id, const char * a_title, const char * a_desc, const char * a_alias, const char * a_metadata, bool a_md_merge, const char * a_proj_id )
{
    Auth::RecordUpdateRequest req;

    req.set_id( a_id );
    if ( a_title )
        req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );
    if ( a_metadata )
    {
        req.set_metadata( a_metadata );
        req.set_md_merge( a_md_merge );
    }
    if ( a_proj_id )
        req.set_proj_id( a_proj_id );

    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}


void
Client::recordDelete( const std::string & a_id )
{
    Auth::RecordDeleteRequest   req;
    Anon::AckReply *            rep;

    req.set_id( a_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}


spCollDataReply
Client::collList( const std::string & a_user, bool a_details, uint32_t a_offset, uint32_t a_count )
{
    Auth::CollListRequest req;

    if ( a_user.size() )
        req.set_user( a_user );
    if ( a_details )
        req.set_details( a_details );
    if ( a_offset )
        req.set_offset( a_offset );
    if ( a_count )
        req.set_count( a_count );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

spCollDataReply
Client::collView( const std::string & a_id )
{
    Auth::CollViewRequest req;
    req.set_id( a_id );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

spCollDataReply
Client::collRead( const std::string & a_coll_id, CollMode a_mode, bool a_details, uint32_t a_offset, uint32_t a_count )
{
    Auth::CollReadRequest req;

    req.set_id( a_coll_id );
    if ( a_mode )
        req.set_mode( a_mode );
    if ( a_details )
        req.set_details( a_details );
    if ( a_offset )
        req.set_offset( a_offset );
    if ( a_count )
        req.set_count( a_count );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

spCollDataReply
Client::collCreate( const std::string & a_title, const char * a_desc, const char * a_alias, const char * a_proj_id, const char * a_coll_id )
{
    Auth::CollCreateRequest req;

    req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );
    if ( a_proj_id )
        req.set_proj_id( a_proj_id );
    if ( a_coll_id )
        req.set_coll_id( a_coll_id );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

spCollDataReply
Client::collUpdate( const std::string & a_id, const char * a_title, const char * a_desc, const char * a_alias, const char * a_proj_id )
{
    Auth::CollUpdateRequest req;

    req.set_id( a_id );
    if ( a_title )
        req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );
    if ( a_proj_id )
        req.set_proj_id( a_proj_id );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

void
Client::collAddItem( const std::string & a_coll_id, const std::string & a_item_id )
{
    Auth::CollWriteRequest  req;
    Anon::AckReply *        rep;

    req.set_id( a_coll_id );
    req.add_add( a_item_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

void
Client::collRemoveItem( const std::string & a_coll_id, const std::string & a_item_id )
{
    Auth::CollWriteRequest  req;
    Anon::AckReply *        rep;

    req.set_id( a_coll_id );
    req.add_rem( a_item_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

spXfrDataReply
Client::dataGet( const std::string & a_data_id, const std::string & a_local_path )
{
    Auth::DataGetRequest    req;
    Auth::XfrDataReply *    rep;

    req.set_id( a_data_id );
    req.set_local( a_local_path );

    send<>( req, rep, m_ctx++ );

    return spXfrDataReply( rep );
}


spXfrDataReply
Client::dataPut( const std::string & a_data_id, const std::string & a_local_path )
{
    Auth::DataPutRequest    req;
    Auth::XfrDataReply *    rep;

    req.set_id( a_data_id );
    req.set_local( a_local_path );

    send<>( req, rep, m_ctx++ );

    return spXfrDataReply( rep );
}


void
Client::dataDelete( const std::string & a_id )
{
    Auth::DataDeleteRequest req;
    Anon::AckReply *        rep;

    req.set_id( a_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}


spXfrDataReply
Client::xfrView( const std::string & a_xfr_id )
{
    Auth::XfrViewRequest    req;
    Auth::XfrDataReply *    rep;

    req.set_xfr_id( a_xfr_id );

    send<>( req, rep, m_ctx++ );

    return spXfrDataReply( rep );
}

spACLDataReply
Client::aclView( const std::string & a_id )
{
    Auth::ACLViewRequest    req;
    Auth::ACLDataReply *    rep;

    req.set_id( a_id );

    send<>( req, rep, m_ctx++ );

    return spACLDataReply( rep );
}

spACLDataReply
Client::aclUpdate( const std::string & a_id, const std::string & a_rules )
{
    Auth::ACLUpdateRequest  req;
    Auth::ACLDataReply *    rep;

    req.set_id( a_id );
    req.set_rules( a_rules );

    send<>( req, rep, m_ctx++ );

    return spACLDataReply( rep );
}

// ===== GROUP METHODS =====

spGroupDataReply
Client::groupCreate( const std::string & a_group_id, const char * a_title, const char * a_desc )
{
    Auth::GroupCreateRequest  req;
    Auth::GroupDataReply *  rep;

    req.mutable_group()->set_gid( a_group_id );
    if ( a_title )
        req.mutable_group()->set_title( a_title );
    if ( a_desc )
        req.mutable_group()->set_desc( a_desc );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupUpdate( const std::string & a_group_id, const char * a_title, const char * a_desc )
{
    Auth::GroupUpdateRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );
    if ( a_title )
        req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

void Client::groupDelete( const std::string & a_group_id )
{
    Auth::GroupDeleteRequest  req;
    Anon::AckReply *        rep;

    req.set_gid( a_group_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

spGroupDataReply
Client::groupList()
{
    Auth::GroupListRequest  req;
    Auth::GroupDataReply *  rep;

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupView( const std::string & a_group_id )
{
    Auth::GroupViewRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupAdd( const std::string & a_group_id, const std::vector<std::string> & a_uids )
{
    Auth::GroupUpdateRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );
    for ( vector<string>::const_iterator u = a_uids.begin(); u != a_uids.end(); ++u )
        req.add_add_uid( *u );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupRemove( const std::string & a_group_id, const std::vector<std::string> & a_uids )
{
    Auth::GroupUpdateRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );
    for ( vector<string>::const_iterator u = a_uids.begin(); u != a_uids.end(); ++u )
        req.add_rem_uid( *u );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}


/*
spResolveXfrReply resolveXfr( const string & a_id, uint32_t a_perms )
{
    Auth::ResolveXfrRequest req;

    req.set_id( a_id );
    req.set_perms( a_perms );

    Auth::ResolveXfrReply * reply;

    send<>( req, reply, m_ctx++ );

    return spResolveXfrReply( reply );
}
*/

#if 0
void Client::checkPath( const string & a_dest_path, /*const string & a_file_name,*/ uint16_t a_flags )
{
    boost::filesystem::path dest_path( a_dest_path );
    boost::system::error_code ec;

    // Create or check dest path

    if ( a_flags & CREATE_PATH )
    {
        if ( !create_directories( dest_path, ec ) && ec.value() != boost::system::errc::success )
            EXCEPT_PARAM( ID_DEST_PATH_ERROR, "Could not create dest path: " << ec.message() );
    }
    else
    {
        if ( !exists( dest_path, ec ) )
            EXCEPT_PARAM( ID_DEST_PATH_ERROR, "Destination path does not exist: " << a_dest_path );
    }

    // See if raw data file already exist
    /*
    boost::filesystem::path dest_file = dest_path;
    dest_file /= boost::filesystem::path( a_file_name );

    cout << dest_file << "\n";
    if ( exists( dest_file, ec ) )
    {
        if ( a_flags & BACKUP )
        {
            boost::filesystem::path bak_file_base = dest_file;

            uint32_t num = 1;
            for ( ; num < 100; ++num )
            {
                boost::filesystem::path bak_file = bak_file_base;
                bak_file += boost::filesystem::path( "." + to_string( num ));

                if ( !exists( bak_file, ec ))
                {
                    boost::filesystem::rename( dest_file, bak_file, ec );
                    if ( ec.value() != boost::system::errc::success )
                        EXCEPT_PARAM( ID_DEST_FILE_ERROR, "Could not backup destination file: " << ec.message() );

                    break;
                }
            }

            if ( num == 100 )
                EXCEPT( ID_DEST_FILE_ERROR, "Unable to backup destination file (too many existing backup files)" );
        }
        else if ( a_flags & OVERWRITE )
        {
            boost::filesystem::file_status s = boost::filesystem::status( dest_file );
            if (( s.permissions() & 0200 ) != 0200 )
                EXCEPT( ID_DEST_FILE_ERROR, "Can not overwrite destination file (no permission)" );
        }
        else  
        {
            EXCEPT( ID_DEST_FILE_ERROR, "Destination file already exists (no Overwrite/Backup)" );
        }
    }*/

    // Test writing to dest path

    boost::filesystem::path tmp = dest_path;
    tmp /= boost::filesystem::unique_path();
    ofstream tmpf( tmp.native().c_str() );

    if ( tmpf.is_open() )
    {
        tmpf.close();
        boost::filesystem::remove( tmp );
    }
    else
    {
        EXCEPT_PARAM( ID_DEST_PATH_ERROR, "Can not write to destination path: " << a_dest_path );
    }
}
#endif

}}


