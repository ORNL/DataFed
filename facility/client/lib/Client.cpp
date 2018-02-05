#include <iostream>
#include <fstream>
#include <stdexcept>
#include <thread>

#include <asio.hpp>
#include <asio/ssl.hpp>

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

asio::ip::tcp::no_delay no_delay_on(true);
asio::ip::tcp::no_delay no_delay_off(false);

class Client::ClientImpl
{
public:
    ClientImpl( const std::string & a_host, uint32_t a_port, uint32_t a_timeout ) :
        m_host( a_host ),
        m_port( a_port ),
        m_resolver(m_io_service),
        m_socket(m_io_service),
        m_io_thread(0),
        m_timeout(a_timeout),
        m_ctx(1)
    {
        REG_PROTO( SDMS );
        REG_PROTO( Facility );

    }

    ~ClientImpl()
    {
    }

    void start()
    {
        auto endpoint_iterator = m_resolver.resolve({ m_host, to_string( m_port ) });

        connect( endpoint_iterator );

        m_io_thread = new thread([this](){ m_io_service.run(); });
    }

    void connect( asio::ip::tcp::resolver::iterator endpoint_iterator )
    {
        asio::async_connect( m_socket, endpoint_iterator,
            [this]( error_code ec, asio::ip::tcp::resolver::iterator )
            {
                if (!ec)
                {
                    cout << "connected\n";
                    //asio::ip::tcp::no_delay option(true);
                    //m_socket.set_option(option);

                    //readMsgHeader();
                }
                else
                {
                    cerr << ec.message() << "\n";
                    //connect( endpoint_iterator );
                }
            });
    }

#if 0
    void readMsgHeader()
    {
        asio::async_read( m_socket, asio::buffer( (char*)&m_in_buf.getFrame(), sizeof( MsgBuf::Frame )),
            [this]( error_code ec, size_t len )
            {
                cout << "read hdr cb, len: " << len << "\n";

                if ( !ec )
                {
                    readMsgBody();
                }
                else
                {
                    cerr << ec.message() << "\n";
                    readMsgHeader();
                }
            });
    }

    void readMsgBody()
    {
        cout << "ClientImpl::readMsgBody\n";
        asio::async_read( m_socket, asio::buffer( m_in_buf.getBuffer(), m_in_buf.getFrame().size ),
            [this]( error_code ec, size_t len )
            {
                cout << "read body cb, len: " << len << "\n";
                if ( !ec )
                {
                    MsgBuf::Message *msg = m_in_buf.unserialize();
                    cout << "got msg: " << msg << "\n";
                    delete msg;
                }
                else
                {
                    cerr << ec.message() << "\n";
                }

                readMsgHeader();
            });
    }

    void writeMsgHeader()
    {
        asio::async_write( m_socket, asio::buffer( (char*)&m_out_buf.getFrame(), sizeof( MsgBuf::Frame )),
            [this]( error_code ec, size_t len )
            {
                cout << "read hdr cb, len: " << len << "\n";

                if ( !ec )
                {
                    readMsgBody();
                }
                else
                {
                    cerr << ec.message() << "\n";
                    readMsgHeader();
                }
            });
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

        uint32_t len = asio::write( m_socket, asio::buffer( (char*)&m_out_buf.getFrame(), sizeof( MsgBuf::Frame )));
        if ( len != sizeof( MsgBuf::Frame ))
            EXCEPT( 1, "Write header failed" );

        //cout << "sent header, len: " << len << "\n";

        m_socket.set_option(no_delay_on);

        len = asio::write( m_socket, asio::buffer( m_out_buf.getBuffer(), m_out_buf.getFrame().size ));
        if ( len != m_out_buf.getFrame().size )
            EXCEPT( 1, "Write body failed" );

        //cout << "sent body, len: " << len << "\n";

        m_socket.set_option(no_delay_off);

        len = asio::read( m_socket, asio::buffer( (char*)&m_in_buf.getFrame(), sizeof( MsgBuf::Frame )));
        if ( len != sizeof( MsgBuf::Frame ))
            EXCEPT( 1, "Read header failed" );

        //cout << "rcv header, len: " << len << "\n";
        if ( m_in_buf.getFrame().size )
        {
            //cout << "need more: " << m_in_buf.getFrame().size << "\n";
            m_in_buf.ensureCapacity( m_in_buf.getFrame().size );
            len = asio::read( m_socket, asio::buffer( m_in_buf.getBuffer(), m_in_buf.getFrame().size ));
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
    
    Status status()
    {
        //cout << "status\n";

        StatusRequest req;
        StatusReply * reply = 0;

        send<>( req, reply, m_ctx++ );

        Status stat = reply->status();

        //cout << "Got status: " << stat << "\n";

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

        delete reply;
    }


/*
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

        m_connection.requestReply<>( req, reply, m_ctx++, m_timeout );

        HANDLE_REPLY_ERROR( reply );

        return spUserListReply( reply );
    }
*/

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
    string                      m_host;
    uint32_t                    m_port;
    asio::io_service            m_io_service;
    asio::ip::tcp::resolver     m_resolver;
    asio::ip::tcp::socket       m_socket;
    thread *                    m_io_thread;
    uint32_t                    m_timeout;
    uint16_t                    m_ctx;
    MsgBuf                      m_in_buf;
    MsgBuf                      m_out_buf;
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


/*
spUserListReply
Client::userList( bool a_details, uint32_t a_offset, uint32_t a_count )
{
    return m_impl->userList( a_details, a_offset, a_count );
}*/

/*
bool Client::send( Message & a_request, Message *& a_reply, uint32_t a_timeout )
{
    return m_impl->send( a_request, a_reply, a_timeout );
}*/

}}


