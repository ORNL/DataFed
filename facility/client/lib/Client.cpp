#define USE_TLS

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

#ifdef USE_TLS

#include <asio/ssl.hpp>

typedef asio::ssl::stream<asio::ip::tcp::socket> ssl_socket;

//#define NO_DELAY_ON(sock) (void)0
//#define NO_DELAY_OFF(sock) (void)0
#define NO_DELAY_ON(sock) sock->lowest_layer().set_option(no_delay_on)
#define NO_DELAY_OFF(sock) sock->lowest_layer().set_option(no_delay_off)

#else

#define NO_DELAY_ON(sock) sock->set_option(no_delay_on)
#define NO_DELAY_OFF(sock) sock->set_option(no_delay_off)

#endif

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

#define DEBUG_GSI

typedef std::shared_ptr<Auth::ResolveXfrReply> spResolveXfrReply;


class Client::ClientImpl
{
public:
    ClientImpl( const std::string & a_host, uint32_t a_port, uint32_t a_timeout ) :
        m_host( a_host ),
        m_port( a_port ),
        m_resolver( m_io_service ),
        #ifdef USE_TLS
        m_context( asio::ssl::context::tlsv12 ),
        #endif
        m_socket( 0 ),
        m_io_thread( 0 ),
        m_timeout( a_timeout ),
        m_ctx( 1 ),
        m_state(NOT_STARTED)
    {
        REG_PROTO( SDMS::Anon );
        REG_PROTO( SDMS::Auth );

        #ifdef USE_TLS

        //m_context.add_verify_path("/etc/ssl/certs");
        m_context.load_verify_file("/home/d3s/olcf/SDMS/server_cert.pem");
        m_context.use_certificate_file( "/home/d3s/olcf/SDMS/client_cert2.pem", asio::ssl::context::pem );
        m_context.use_private_key_file( "/home/d3s/olcf/SDMS/client_key2.pem", asio::ssl::context::pem );

        m_socket = new ssl_socket( m_io_service, m_context );

        m_socket->set_verify_mode( asio::ssl::verify_peer | asio::ssl::verify_fail_if_no_peer_cert );
        m_socket->set_verify_callback( bind( &ClientImpl::verifyCert, this, placeholders::_1, placeholders::_2 ));
        #else
        m_socket = new asio::ip::tcp::socket( m_io_service );
        #endif
    }

    ~ClientImpl()
    {
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
        m_div = reply->div();

        delete reply;

    }

    void connect( asio::ip::tcp::resolver::iterator endpoint_iterator )
    {
        cout << "connecting" << endl;

        #ifdef USE_TLS

        asio::async_connect( m_socket->lowest_layer(), endpoint_iterator,
            [this]( error_code ec, asio::ip::tcp::resolver::iterator )
            {
                if (!ec)
                {
                    cout << "connected" << endl;
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

        #else

        asio::async_connect( *m_socket, endpoint_iterator,
            [this]( error_code ec, asio::ip::tcp::resolver::iterator )
            {
                unique_lock<mutex> lock(m_mutex);

                if (!ec)
                {
                    cout << "connected\n";
                    m_state = STARTED;
                }
                else
                {
                    cerr << ec.message() << "\n";
                    m_state = FAILED;
                }

                m_start_cvar.notify_all();
            });

        #endif
    }

    #ifdef USE_TLS

    void handShake()
    {
        cout << "starting handshake" << endl;

        m_socket->async_handshake( asio::ssl::stream_base::client,
            [this]( error_code ec )
            {
                cout << "handshake callback" << endl;

                unique_lock<mutex> lock(m_mutex);
                if ( !ec )
                {
                    cout << "handshake ok"  << endl ;
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

        cout << "Verifying " << subject_name << "\n";

        return a_preverified;
    }

    #endif


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
            cout << "write err: " << ec.category().name() << "[" << ec.value() << "] " << ec.message() << endl;
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

        cout << "unserialize\n";
        MsgBuf::Message * raw_reply = m_in_buf.unserialize();
        cout << "msg: " << raw_reply << "\n";
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

    void generateClientCredentials( const string & a_out_path, const string & a_env_name )
    {
        char * uid = getlogin();
        if ( uid == 0 )
            EXCEPT( 0, "Could not determine login name" );

        string key_file = a_out_path + "/" + uid + "-" + a_env_name + "-key.pem";
        string cert_file = a_out_path + "/" + uid + "-" + a_env_name + "-cert.pem";

        string cmd = "openssl req -newkey rsa:2048 -nodes -subj /DC=" + m_country + "/DC=" + m_org + "/DC=" + m_div + "/DC=" + a_env_name + "/CN=" + uid + " -keyout " + key_file + " -x509 -days 365 -out " + cert_file;

        if ( system( cmd.c_str() ))
            EXCEPT( 0, "Credential generation failed. Check specifed path and env name." );
        
        ifstream inf( cert_file );

        if ( !inf.is_open() || !inf.good() )
            EXCEPT( 0, "Could not open new cert file" );

        string cert(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());

        inf.close();
        
        cout << "New cert [" << cert << "]\n";
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
                cerr << "unerialize failed\n";
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

    std::string
    getData( const std::string & a_data_id, const std::string & a_dest_path, uint16_t a_flags )
    {
        spResolveXfrReply xfr = resolveXfr( a_data_id, PERM_DAT_READ );

        // TODO keyfile must be configured externally (default plus env var override)
        string keyfile = "~/.ssh/id_rsa.globus";

        handleDestination( a_dest_path, xfr->src_name(), a_flags );

        // Use Legacy Globus CLI to start transfer
        string cmd = "ssh -i " + keyfile + " " + xfr->globus_id() + "@cli.globusonline.org transfer -- " + xfr->src_path() + xfr->src_name() + " " + a_dest_path;

        cout << cmd << "\n";

        string task_id = "foo"; //globusStub( 1 );

/*
        string result = exec( cmd.c_str() );
        if ( result.compare( 0, 9, "Task ID: " ) == 0 )
        {
            return result.substr( 9 );
        }
        else
        {
            EXCEPT_PARAM( 0, "Globus CLI Error: " << result );
        }
*/
        //startXfr( xfr->id(), PERM_DAT_READ, task_id );

        return task_id;
    }

    XfrStatus
    getDataTransferStatus( const std::string & a_transfer_id )
    {
        (void)a_transfer_id;
        return XFR_FAILED;
    }

    spResolveXfrReply resolveXfr( const string & a_id, uint32_t a_perms )
    {
        Auth::ResolveXfrRequest req;

        req.set_id( a_id );
        req.set_perms( a_perms );

        Auth::ResolveXfrReply * reply;

        send<>( req, reply, m_ctx++ );

        return spResolveXfrReply( reply );
    }

private:

    void handleDestination( const string & a_dest_path, const string & a_file_name, uint16_t a_flags )
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
        }

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
    asio::io_service            m_io_service;
    asio::ip::tcp::resolver     m_resolver;
    #ifdef USE_TLS
    asio::ssl::context          m_context;
    ssl_socket *                m_socket;
    #else
    asio::ip::tcp::socket *     m_socket;
    #endif
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
    string                      m_div;
};



// Class ctor/dtor

Client::Client( const std::string & a_host, uint32_t a_port, uint32_t a_timeout )
{
    m_impl = new ClientImpl( a_host, a_port, a_timeout );
}


Client::~Client()
{
    delete m_impl;
}


void Client::start()
{
    return m_impl->start();
}

void Client::generateClientCredentials( const std::string & a_out_path, const std::string & a_env_name )
{
    m_impl->generateClientCredentials( a_out_path, a_env_name );
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

spCollDataReply
Client::collList( const std::string & a_user, bool a_details, uint32_t a_offset, uint32_t a_count )
{
    return m_impl->collList( a_user, a_details, a_offset, a_count );
}

std::string
Client::getData( const std::string & a_data_id, const std::string & a_dest_path, uint16_t a_flags )
{
    return m_impl->getData( a_data_id, a_dest_path, a_flags );
}

XfrStatus
Client::getDataTransferStatus( const std::string & a_transfer_id )
{
    return m_impl->getDataTransferStatus( a_transfer_id );
}

}}


