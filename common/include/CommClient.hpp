#ifndef COMMCLIENT_HPP
#define COMMCLIENT_HPP

#include <iostream>
#include <string>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <stdint.h>
#include <asio.hpp>
#include <asio/ssl.hpp>
#include "MsgBuf.hpp"

#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

namespace SDMS {


#define COMM_NO_DELAY_ON(sock) sock->lowest_layer().set_option(m_no_delay_on)
#define COMM_NO_DELAY_OFF(sock) sock->lowest_layer().set_option(m_no_delay_off)

class CommClient
{
public:
    CommClient( const std::string & a_host, uint32_t a_port, const std::string & a_host_cert, const std::string & a_client_cert, const std::string & a_client_key );
    ~CommClient();

    void    start();
    void    stop();

    template<typename RQT,typename RPT>
    void    send( RQT & a_request, RPT *& a_reply )
    {
        //cout << "send\n";
        uint16_t ctx = m_ctx++;

        a_reply = 0;
        m_out_buf.getFrame().context = ctx;
        m_out_buf.serialize( a_request );

        //cout << "out msg body sz: " << m_out_buf.getFrame().size << "\n";
        if ( m_out_buf.getFrame().size == 0 )
            COMM_NO_DELAY_ON(m_socket);

        std::error_code ec;

        //cout << "1" << endl;

        uint32_t len = asio::write( *m_socket, asio::buffer( (char*)&m_out_buf.getFrame(), sizeof( MsgBuf::Frame )), ec );
        
        if ( ec )
        {
            std::cerr << "write err: " << ec.category().name() << "[" << ec.value() << "] " << ec.message() << std::endl;
        }

        if ( len != sizeof( MsgBuf::Frame ))
            EXCEPT( 1, "Write header failed" );

        //cout << "sent header, len: " << len << "\n";

        if ( m_out_buf.getFrame().size == 0 )
            COMM_NO_DELAY_OFF(m_socket);
        else
        {
            COMM_NO_DELAY_ON(m_socket);

            //cout << "2" << endl;

            len = asio::write( *m_socket, asio::buffer( m_out_buf.getBuffer(), m_out_buf.getFrame().size ));
            if ( len != m_out_buf.getFrame().size )
                EXCEPT( 1, "Write body failed" );

            //cout << "sent body, len: " << len << "\n";

            COMM_NO_DELAY_OFF(m_socket);
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

        if ( m_in_buf.getFrame().context != ctx )
            EXCEPT_PARAM( 1, "Reply context mismatch. Expected " << ctx << " got " << m_in_buf.getFrame().context );

        MsgBuf::Message * raw_reply = m_in_buf.unserialize();
        //cout << "msg: " << raw_reply << "\n";
        if (( a_reply = dynamic_cast<RPT *>( raw_reply )) == 0 )
        {
            Anon::NackReply * nack = dynamic_cast<Anon::NackReply *>( raw_reply );
            if ( nack )
            {
                uint32_t ec = nack->err_code();
                std::string msg;
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

private:
    typedef asio::ssl::stream<asio::ip::tcp::socket> ssl_socket;

    void    connect( asio::ip::tcp::resolver::iterator endpoint_iterator );
    bool    verifyCert( bool a_preverified, asio::ssl::verify_context & a_context );
    void    handShake();

    enum State
    {
        NOT_STARTED,
        STARTED,
        FAILED
    };

    std::string                 m_host;
    uint32_t                    m_port;
    std::string                 m_cred_path;
    asio::io_service            m_io_service;
    asio::ip::tcp::resolver     m_resolver;
    asio::ssl::context          m_context;
    ssl_socket *                m_socket;
    std::thread *               m_io_thread;
    uint16_t                    m_ctx;
    MsgBuf                      m_in_buf;
    MsgBuf                      m_out_buf;
    State                       m_state;
    std::condition_variable     m_start_cvar;
    std::mutex                  m_mutex;
    asio::ip::tcp::no_delay     m_no_delay_on;
    asio::ip::tcp::no_delay     m_no_delay_off;
};

}

#endif
