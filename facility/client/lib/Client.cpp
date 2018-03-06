#include <iostream>
#include <fstream>
#include <stdexcept>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <boost/filesystem.hpp>

#include <asio.hpp>

asio::ip::tcp::no_delay no_delay_on(true);
asio::ip::tcp::no_delay no_delay_off(false);

#include <asio/ssl.hpp>

typedef asio::ssl::stream<asio::ip::tcp::socket> ssl_socket;

//#define NO_DELAY_ON(sock) (void)0
//#define NO_DELAY_OFF(sock) (void)0
#define NO_DELAY_ON(sock) sock->lowest_layer().set_option(no_delay_on)
#define NO_DELAY_OFF(sock) sock->lowest_layer().set_option(no_delay_off)

#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>


#include "Exec.hpp"
#include "MsgBuf.hpp"
#include "Client.hpp"

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


class Client::ClientImpl
{
public:
    ClientImpl( const std::string & a_host, uint32_t a_port, uint32_t a_timeout, const std::string & a_cred_path, const std::string & a_unit, bool a_load_certs ) :
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

        //m_context.add_verify_path("/etc/ssl/certs");
        m_context.load_verify_file("/home/d3s/.sdms/sdmsd-CCS-cert.pem");
        
        if ( m_cred_path.size() && *m_cred_path.rbegin() != '/' )
            m_cred_path += "/";

        m_cert_file = m_cred_path + uid + "-" + a_unit + "-cert.pem";
        m_key_file = m_cred_path + uid + "-" + a_unit + "-key.pem";

        if ( a_load_certs )
        {
            m_context.use_certificate_file( m_cert_file, asio::ssl::context::pem );
            m_context.use_private_key_file( m_key_file , asio::ssl::context::pem );
        }

        m_socket = new ssl_socket( m_io_service, m_context );

        m_socket->set_verify_mode( asio::ssl::verify_peer | asio::ssl::verify_fail_if_no_peer_cert );
        m_socket->set_verify_callback( bind( &ClientImpl::verifyCert, this, placeholders::_1, placeholders::_2 ));
    }

    ~ClientImpl()
    {
        stop();

        delete m_socket;
    }

    void start()
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

    void stop()
    {
        if ( m_state == STARTED )
        {
            error_code ec;
            m_socket->lowest_layer().cancel( ec );
            m_socket->shutdown( ec );
            m_state = NOT_STARTED;
        }
    }

    void connect( asio::ip::tcp::resolver::iterator endpoint_iterator )
    {
        asio::async_connect( m_socket->lowest_layer(), endpoint_iterator,
            [this]( error_code ec, asio::ip::tcp::resolver::iterator )
            {
                if (!ec)
                {
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

    void handShake()
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

    bool verifyCert( bool a_preverified, asio::ssl::verify_context & a_context )
    {
        (void)a_preverified;

        char subject_name[256];

        X509* cert = X509_STORE_CTX_get_current_cert( a_context.native_handle() );
        X509_NAME_oneline( X509_get_subject_name( cert ), subject_name, 256 );

        return a_preverified;
    }


    template<typename RQT,typename RPT>
    void send( RQT & a_request, RPT *& a_reply, uint16_t a_context )
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

        //cout << "send: " << t1 << ", recv: " << t2 << "\n";

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

    void generateCredentials( uint8_t a_flags )
    {
        char * uid = getlogin();
        if ( uid == 0 )
            EXCEPT( 0, "Could not determine login name" );

        GenerateCredentialsRequest req;
        GenerateCredentialsReply * reply = 0;

        if ( a_flags & GEN_X509 )
            req.set_x509( true );

        if ( a_flags & GEN_SSH )
            req.set_ssh( true );

        send<>( req, reply, m_ctx++ );

        if ( a_flags & GEN_X509 )
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
        }

        if ( a_flags & GEN_SSH )
        {
            string ssh_file = string("/tmp/") + uid + "-" + m_unit + "-ssh-pub.rsa";

            //cout << "Saving " << ssh_file << "\n";
            ofstream  outf( ssh_file );
            if ( !outf.is_open() || !outf.good() )
                EXCEPT_PARAM( 0, "Could not open " << ssh_file << " for write" );

            outf << reply->ssh_pub();
            outf.close();
        }

        delete reply;
    }

    bool test( size_t a_iter )
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


    ServiceStatus status()
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
    authenticate( const string & a_uid, const string & a_password )
    {
        AuthenticateRequest req;

        req.set_uid( a_uid );
        req.set_password( a_password );

        AckReply * reply;

        send<>( req, reply, m_ctx++ );
    }

    spUserDataReply
    userView( const string & a_user )
    {
        Auth::UserViewRequest req;

        if ( a_user.size() )
            req.set_user( a_user );

        Auth::UserDataReply * reply;

        send<>( req, reply, m_ctx++ );

        return spUserDataReply( reply );
    }

    spUserDataReply
    userList( bool a_details, uint32_t a_offset, uint32_t a_count )
    {
        Auth::UserListRequest req;

        if ( a_details )
            req.set_details( a_details );
        if ( a_offset )
            req.set_offset( a_offset );
        if ( a_count )
            req.set_count( a_count );

        Auth::UserDataReply * reply;

        send<>( req, reply, m_ctx++ );

        return spUserDataReply( reply );
    }

    spRecordDataReply
    recordView( const std::string & a_id )
    {
        Auth::RecordViewRequest req;
        req.set_id( a_id );

        Auth::RecordDataReply * reply;

        send<>( req, reply, m_ctx++ );

        return spRecordDataReply( reply );
    }

    spRecordDataReply
    recordCreate( const std::string & a_title, const char * a_desc, const char * a_alias, const char * a_metadata, const char * a_proj_id, const char * a_coll_id )
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

    spCollDataReply
    collList( const std::string & a_user, bool a_details, uint32_t a_offset, uint32_t a_count )
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

    spXfrDataReply
    getData( const std::string & a_data_id, const std::string & a_local_path )
    {
        Auth::GetDataRequest    req;
        Auth::XfrDataReply *    rep;

        req.set_id( a_data_id );
        req.set_local( a_local_path );

        send<>( req, rep, m_ctx++ );

        return spXfrDataReply( rep );
    }

    spXfrDataReply
    putData( const std::string & a_local_path, const string & a_data_id )
    {
        Auth::PutDataRequest    req;
        Auth::XfrDataReply *    rep;

        req.set_id( a_data_id );
        req.set_local( a_local_path );

        send<>( req, rep, m_ctx++ );

        return spXfrDataReply( rep );
    }

    spXfrDataReply
    putData( const std::string & a_local_path, const std::string & a_title, std::string & a_data_id, const char * a_desc, const char * a_alias, const char * a_metadata, const char * a_proj_id, const char * a_coll_id )
    {
        // Create data record
        spRecordDataReply rec_reply = recordCreate( a_title, a_desc, a_alias, a_metadata, a_proj_id, a_coll_id );
        a_data_id = rec_reply->record(0).id();

        return putData( a_local_path, a_data_id );
    }

    spXfrDataReply
    xfrView( const std::string & a_xfr_id )
    {
        Auth::XfrViewRequest    req;
        Auth::XfrDataReply *    rep;

        req.set_xfr_id( a_xfr_id );

        send<>( req, rep, m_ctx++ );

        return spXfrDataReply( rep );
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

private:

    void checkPath( const string & a_dest_path, /*const string & a_file_name,*/ uint16_t a_flags )
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

    enum State
    {
        NOT_STARTED,
        STARTED,
        FAILED
    };

    string                      m_host;
    uint32_t                    m_port;
    string                      m_cred_path;
    string                      m_unit;
    string                      m_cert_file;
    string                      m_key_file;
    asio::io_service            m_io_service;
    asio::ip::tcp::resolver     m_resolver;
    asio::ssl::context          m_context;
    ssl_socket *                m_socket;
    thread *                    m_io_thread;
    uint32_t                    m_timeout;
    uint16_t                    m_ctx;
    MsgBuf                      m_in_buf;
    MsgBuf                      m_out_buf;
    State                       m_state;
    condition_variable          m_start_cvar;
    mutex                       m_mutex;
    string                      m_country;
    string                      m_org;
};



// Class ctor/dtor

Client::Client( const std::string & a_host, uint32_t a_port, uint32_t a_timeout, const std::string & a_cred_path, const std::string & a_unit, bool a_load_certs )
{
    m_impl = new ClientImpl( a_host, a_port, a_timeout, a_cred_path, a_unit, a_load_certs );
}


Client::~Client()
{
    delete m_impl;
}


void Client::start()
{
    m_impl->start();
}

void Client::stop()
{
    m_impl->stop();
}

void Client::authenticate( const std::string & a_uname, const std::string & a_password )
{
    m_impl->authenticate( a_uname, a_password );
}

void Client::generateCredentials( uint8_t a_flags )
{
    m_impl->generateCredentials( a_flags );
}

bool
Client::test( size_t a_iter )
{
    return m_impl->test( a_iter );
}

ServiceStatus Client::status()
{
    return m_impl->status();
}


spUserDataReply
Client::userView( const string & a_user )
{
    return m_impl->userView( a_user );
}

spUserDataReply
Client::userList( bool a_details, uint32_t a_offset, uint32_t a_count )
{
    return m_impl->userList( a_details, a_offset, a_count );
}

spRecordDataReply
Client::recordView( const std::string & a_id )
{
    return m_impl->recordView( a_id );
}

spRecordDataReply
Client::recordCreate( const std::string & a_title, const char * a_desc, const char * a_alias, const char * a_metadata, const char * a_proj_id, const char * a_coll_id )
{
    return m_impl->recordCreate( a_title, a_desc, a_alias, a_metadata, a_proj_id, a_coll_id );
}

spCollDataReply
Client::collList( const std::string & a_user, bool a_details, uint32_t a_offset, uint32_t a_count )
{
    return m_impl->collList( a_user, a_details, a_offset, a_count );
}

spXfrDataReply
Client::getData( const std::string & a_data_id, const std::string & a_dest_path )
{
    return m_impl->getData( a_data_id, a_dest_path );
}

spXfrDataReply
Client::putData( const std::string & a_src_path, const string & a_data_id )
{
    return m_impl->putData( a_src_path, a_data_id );
}

spXfrDataReply
Client::putData( const std::string & a_src_path, const std::string & a_title, std::string & a_data_id, const char * a_desc, const char * a_alias, const char * a_metadata, const char * a_proj_id, const char * a_coll_id )
{
    return m_impl->putData( a_src_path, a_title, a_data_id, a_desc, a_alias, a_metadata, a_proj_id, a_coll_id );
}

spXfrDataReply
Client::xfrView( const std::string & a_transfer_id )
{
    return m_impl->xfrView( a_transfer_id );
}

}}


