#define USE_TLS

#include <iostream>
#include <fstream>
#include <stdexcept>
#include <thread>
#include <mutex>
#include <condition_variable>

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

#include "unistd.h"
#include "sys/types.h"


#include "MsgBuf.hpp"
#include "Client.hpp"

#include <time.h>

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))

//#include "GSSAPI_Utils.hpp"

using namespace std;

namespace SDMS {
namespace Facility {

#define DEBUG_GSI

#define HANDLE_REPLY_ERROR( reply ) \
    if ( reply->has_header() && reply->header().has_err_code() ) \
    { \
        uint32_t ec = reply->header().has_err_code(); \
        if ( reply->header().has_err_msg() ) \
        { \
            string em = reply->header().err_msg(); \
            delete reply; \
            EXCEPT( ec, em ); \
        } \
        else \
        { \
            delete reply; \
            EXCEPT( ec, "Request failed." ); \
        } \
    }



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
        REG_PROTO( SDMS );

        #ifdef USE_TLS

        //m_context.add_verify_path("/etc/ssl/certs");
        m_context.load_verify_file("/home/d3s/olcf/SDMS/server_cert.pem");
        m_context.use_certificate_file( "/home/d3s/olcf/SDMS/client_cert.pem", asio::ssl::context::pem );
        m_context.use_private_key_file( "/home/d3s/olcf/SDMS/client_key.pem", asio::ssl::context::pem );

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

        //cout << "unserialize\n";
        MsgBuf::Message * raw_reply = m_in_buf.unserialize();
        if (( a_reply = dynamic_cast<RPT *>( raw_reply )) == 0 )
        {
            delete raw_reply;
            EXCEPT( 1, "Bad reply type" );
        }
        //cout << "a_reply: " << a_reply << "\n";
    }

    bool test( size_t a_iter )
    {
        StatusReply     in;
        StatusReply *   out = 0;
        MsgBuf::Message *       raw;
        MsgBuf          buf;

        for ( size_t i = 0; i < a_iter; ++i )
        {
            in.set_status( NORMAL );
            buf.serialize( in );
            raw = buf.unserialize();
            if ( !raw )
            {
                cerr << "unerialize failed\n";
                return false;
            }
            out = dynamic_cast<StatusReply *>(raw);
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


    string text( const string & a_message )
    {
        TextRequest req;
        TextReply * reply = 0;

        req.set_data( a_message );

        send<>( req, reply, m_ctx++ );

        HANDLE_REPLY_ERROR( reply );

        string answer = reply->data();

        delete reply;
        
        return answer;
    }


    Status status()
    {
        //cout << "status\n";

        StatusRequest req;
        StatusReply * reply = 0;

        send<>( req, reply, m_ctx++ );

        Status stat = reply->status();

        HANDLE_REPLY_ERROR( reply );

        delete reply;

        return stat;
    }

    /**
     * @brief Verify server is listening an in-synch
     */
    void ping()
    {
        PingRequest req;
        PingReply * reply = 0;

        send<>( req, reply, m_ctx++ );

        HANDLE_REPLY_ERROR( reply );

        delete reply;
    }


    spUserListReply
    userList( bool a_details, uint32_t a_offset, uint32_t a_count )
    {
        cout << "userList\n";

        UserListRequest req;
        if ( a_details )
            req.set_details( a_details );
        if ( a_offset )
            req.set_offset( a_offset );
        if ( a_count )
            req.set_count( a_count );

        UserListReply * reply;

        send<>( req, reply, m_ctx++ );

        HANDLE_REPLY_ERROR( reply );

        return spUserListReply( reply );
    }


/*
    bool send( Message & a_request, Message *& a_reply, uint32_t a_timeout )
    {
        (void)a_request;
        (void)a_reply;
        (void)a_timeout;
        return false;
    }
*/


private:
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

bool
Client::test( size_t a_iter )
{
    return m_impl->test( a_iter );
}

string
Client::text( const string & a_message )
{
    return m_impl->text( a_message );
}

Status Client::status()
{
    return m_impl->status();
}

/**
 * @brief Verify server is listening and in-synch
 */
void Client::ping()
{
    m_impl->ping();
}


spUserListReply
Client::userList( bool a_details, uint32_t a_offset, uint32_t a_count )
{
    return m_impl->userList( a_details, a_offset, a_count );
}

/*
bool Client::send( Message & a_request, Message *& a_reply, uint32_t a_timeout )
{
    return m_impl->send( a_request, a_reply, a_timeout );
}*/

}}


