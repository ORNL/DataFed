#define USE_TLS

#include <iostream>
#include <algorithm>
#include <stdexcept>
#include <thread>
#include <mutex>
#include <condition_variable>

#include "unistd.h"
#include "sys/types.h"

#include <asio.hpp>

asio::ip::tcp::no_delay no_delay_on(true);
asio::ip::tcp::no_delay no_delay_off(false);

#ifdef USE_TLS

#include <asio/ssl.hpp>


typedef asio::ssl::stream<asio::ip::tcp::socket> ssl_socket;

#define NO_DELAY_ON(sock) sock.lowest_layer().set_option(no_delay_on)
#define NO_DELAY_OFF(sock) sock.lowest_layer().set_option(no_delay_off)

#else

#define NO_DELAY_ON(sock) sock.set_option(no_delay_on);
#define NO_DELAY_OFF(sock) sock.set_option(no_delay_off);

#endif

#include "MsgBuf.hpp"
#include "DynaLog.hpp"
#include "FacilityServer.hpp"
#include "SDMS.pb.h"

#include <time.h>

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))


using namespace std;

namespace SDMS {
namespace Facility {


#define MAINT_POLL_INTERVAL 2
#define CLIENT_IDLE_TIMEOUT 30
#define SET_MSG_HANDLER(proto_id,name,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, name )] = func

class Session : public enable_shared_from_this<Session>
{
public:
    #ifdef USE_TLS

    Session( asio::io_service & a_io_service, asio::ssl::context& a_context ) :
        m_socket( a_io_service, a_context ),
        m_in_buf( 4096 )
    {
        m_socket.set_verify_mode( asio::ssl::verify_peer | asio::ssl::verify_fail_if_no_peer_cert );
        m_socket.set_verify_callback( bind( &Session::verifyCert, this, placeholders::_1, placeholders::_2 ));
    }

    #else

    Session( asio::ip::tcp::socket a_socket ) :
        m_socket( move( a_socket )),
        m_in_buf( 4096 )
    {
    }

    #endif

    ~Session()
    {
        cout << "Session " << this << " deleted\n";
    }

    static void setupMsgHandlers()
    {
        uint8_t proto_id = REG_PROTO( SDMS );
        SET_MSG_HANDLER( proto_id, "StatusRequest", &Session::procMsgStatus );
        SET_MSG_HANDLER( proto_id, "PingRequest", &Session::procMsgPing );
        SET_MSG_HANDLER( proto_id, "TextRequest", &Session::procMsgText );
        //SET_MSG_HANDLER(proto_id,"UserListRequest",&Worker::procMsgUserListReq);
    }

    void start()
    {
        clock_gettime( CLOCK_REALTIME, &m_last_access );

        #ifdef USE_TLS

        m_socket.async_handshake( asio::ssl::stream_base::server,
            [this]( error_code ec )
            {
                if ( !ec )
                {
                    readMsgHeader();
                }
                else
                {
                    cerr << "start, handshake failed\n";
                    cerr << ec.category().name() << ":" << ec.value() << " " << ec.message() << "\n";
                    // TODO Remove session from server map
                    delete this;
                }
            });

        #else

        readMsgHeader();

        #endif
    }


    string remoteAddress()
    {
        #ifdef USE_TLS
        asio::ip::tcp::endpoint ep = m_socket.lowest_layer().remote_endpoint();
        #else
        asio::ip::tcp::endpoint ep = m_socket.remote_endpoint();
        #endif

        return ep.address().to_string() + ":" + to_string( ep.port() );
    }

private:
    void handleCommError( const string & a_msg, error_code a_ec )
    {
        if ( ec )
        {
            DL_ERROR( a_msg << a_ec.category().name() << "[" << a_ec.value() << "] " << a_ec.message() );
        }
        
        // Server treats 0 access time (sec) as signal to drop session
        m_last_access.tv_sec = 0;
    }

    #ifdef USE_TLS

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

    void readMsgHeader()
    {
        //cout << "Session::readMsgHeader\n";

        asio::async_read( m_socket, asio::buffer( (char*)&m_in_buf.getFrame(), sizeof( MsgBuf::Frame )),
            [this]( error_code ec, size_t )
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

    void readMsgBody()
    {
        //cout << "Session::readMsgBody\n";

        if ( m_in_buf.getFrame().size )
        {
            asio::async_read( m_socket, asio::buffer( m_in_buf.getBuffer(), m_in_buf.getFrame().size ),
                [this]( error_code ec, size_t )
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

    void messageHandler()
    {
        uint16_t msg_type = m_in_buf.getMsgType();
        map<uint16_t,msg_fun_t>::iterator handler = m_msg_handlers.find( msg_type );

        if ( handler != m_msg_handlers.end() )
            (this->*handler->second)();
        else
            DL_ERROR( "Recv unregistered msg type: " << msg_type );

        readMsgHeader();
    }


    void writeMsgHeader()
    {
        //cout << "Session::writeMsgHeader\n";
        
        if ( m_out_buf.getFrame().size == 0 )
            NO_DELAY_ON(m_socket);

        asio::async_write( m_socket, asio::buffer( (char*)&m_out_buf.getFrame(), sizeof( MsgBuf::Frame )),
            [this]( error_code ec, size_t )
            {
                if ( ec )
                    handleCommError( "readMsgBody: ", ec );
                else if ( m_out_buf.getFrame().size )
                    writeMsgBody();

                NO_DELAY_OFF(m_socket);
            });
    }

    void writeMsgBody()
    {
        //cout << "Session::writeMsgBody\n";

        if ( m_out_buf.getFrame().size )
        {
            NO_DELAY_ON(m_socket);

            asio::async_write( m_socket, asio::buffer( m_out_buf.getBuffer(), m_out_buf.getFrame().size ),
                [this]( error_code ec, size_t )
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
    msgclass *msg = 0; \
    ::google::protobuf::Message *base_msg = m_in_buf.unserialize(); \
    if ( base_msg ) \
    { \
        msg = dynamic_cast<msgclass*>( base_msg ); \
        if ( msg ) \
        { \
            DL_TRACE( "Rcvd: " << msg->DebugString()); \
            replyclass reply; \
            try \
            {

    #define PROC_MSG_END \
            } \
            catch( TraceException &e ) \
            { \
                DL_WARN( "Session "<<this<<": exception:" << e.toString() ); \
                reply.mutable_header()->set_err_code( (ErrorCode) e.getErrorCode() ); \
                reply.mutable_header()->set_err_msg( e.toString() ); \
            } \
            catch( exception &e ) \
            { \
                DL_WARN( "Session "<<this<<": " << e.what() ); \
                reply.mutable_header()->set_err_code( ID_INTERNAL_ERROR ); \
                reply.mutable_header()->set_err_msg( e.what() ); \
            } \
            catch(...) \
            { \
                DL_WARN( "Session "<<this<<": unkown exception while processing message!" ); \
                reply.mutable_header()->set_err_code( ID_INTERNAL_ERROR ); \
                reply.mutable_header()->set_err_msg( "Unknown exception type" ); \
            } \
            m_out_buf.getFrame().context = m_in_buf.getFrame().context; \
            m_out_buf.serialize( reply ); \
            writeMsgHeader() \
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


    void procMsgStatus()
    {
        PROC_MSG_BEGIN( StatusRequest, StatusReply )

        reply.set_status( NORMAL );

        PROC_MSG_END
    }


    void procMsgPing()
    {
        PROC_MSG_BEGIN( PingRequest, PingReply )

        // Nothing to do

        PROC_MSG_END
    }

    void procMsgText()
    {
        PROC_MSG_BEGIN( TextRequest, TextReply )

        reply.set_data("Hello client!");

        PROC_MSG_END
    }

    /*void
    procMsgUserListReq()
    {
        cout << "proc user list\n";

        PROC_MSG_BEGIN( UserListRequest, UserListReply )

        if ( client.state != CS_AUTHN )
            EXCEPT( ID_SECURITY_REQUIRED, "Method requires authentication" );

        UserData* user;

        user = reply.add_user();
        user->set_uid("jblow");
        user->set_name_last("Blow");
        user->set_name_first("Joe");

        user = reply.add_user();
        user->set_uid("jdoe");
        user->set_name_last("Doe");
        user->set_name_first("John");

        user = reply.add_user();
        user->set_uid("bsmith");
        user->set_name_last("Smith");
        user->set_name_first("Bob");

        PROC_MSG_END
    }*/

    typedef void (Session::*msg_fun_t)();

    #ifdef USE_TLS
    ssl_socket              m_socket;
    #else
    asio::ip::tcp::socket   m_socket;
    #endif
    MsgBuf                  m_in_buf;
    MsgBuf                  m_out_buf;
    struct timespec         m_last_access = {0,0};

    static map<uint16_t,msg_fun_t> m_msg_handlers;
};


typedef shared_ptr<Session> spSession;

class ServerImpl
{
public:

    ServerImpl( uint32_t a_port, uint32_t a_timeout, uint32_t a_num_threads ) :
        m_port( a_port ),
        m_timeout(a_timeout),
        m_io_thread(0),
        m_maint_thread(0),
        m_num_threads(a_num_threads),
        m_io_running(false),
        m_endpoint( asio::ip::tcp::v4(), m_port ),
        m_acceptor( m_io_service, m_endpoint ),
        #ifdef USE_TLS
        m_context( asio::ssl::context::tlsv12 )
        #else
        m_socket( m_io_service )
        #endif
    {
        #ifdef USE_TLS
        m_context.set_options(
            asio::ssl::context::default_workarounds |
            asio::ssl::context::no_sslv2 |
            asio::ssl::context::no_sslv3 |
            asio::ssl::context::no_tlsv1 |
            asio::ssl::context::no_tlsv1_1 |
            asio::ssl::context::single_dh_use );

        m_context.set_password_callback( bind( &ServerImpl::getPassword, this));
        m_context.use_certificate_chain_file( "/home/d3s/olcf/SDMS/server_cert.pem" );
        m_context.use_private_key_file( "/home/d3s/olcf/SDMS/server_key.pem", asio::ssl::context::pem );
        m_context.load_verify_file("/home/d3s/olcf/SDMS/client_cert.pem");

        #endif

        //m_context.use_tmp_dh_file( "dh512.pem" );

        Session::setupMsgHandlers();

        uint8_t proto_id = REG_PROTO( SDMS );
        SET_MSG_HANDLER( proto_id, "StatusRequest", &Session::procMsgStatus );
        SET_MSG_HANDLER( proto_id, "PingRequest", &Session::procMsgPing );
        SET_MSG_HANDLER( proto_id, "TextRequest", &Session::procMsgText );
        //SET_MSG_HANDLER(proto_id,"UserListRequest",&Worker::procMsgUserListReq);
    }


    ~ServerImpl()
    {
    }

    string getPassword() const
    {
        cout << "Asking for password!\n";
        return "nopass";
    }

    void run( bool a_async )
    {
        unique_lock<mutex> lock(m_api_mutex);

        if ( m_io_running )
            throw runtime_error( "Only one worker router instance allowed" );

        m_io_running = true;

        if ( a_async )
        {
            m_io_thread = new thread( &ServerImpl::ioRun, this );
            m_maint_thread = new thread( &ServerImpl::backgroundMaintenance, this );
        }
        else
        {
            lock.unlock();
            m_maint_thread = new thread( &ServerImpl::backgroundMaintenance, this );
            ioRun();
            lock.lock();
            m_io_running = false;
            m_router_cvar.notify_all();

            m_maint_thread->join();
            delete m_maint_thread;
            m_maint_thread = 0;
        }
    }


    void stop( bool a_wait )
    {
        unique_lock<mutex> lock(m_api_mutex);

        if ( m_io_running )
        {
            // Signal ioPump to stop
            m_io_service.stop();

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

                m_maint_thread->join();
                delete m_maint_thread;
                m_maint_thread = 0;
            }
        }
    }


    void wait()
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

                m_maint_thread->join();
                delete m_maint_thread;
                m_maint_thread = 0;
            }
            else
            {
                while( m_io_running )
                    m_router_cvar.wait( lock );
            }
        }
    }

private:
    void ioRun()
    {
        DL_INFO( "io thread started" );

        if ( m_io_service.stopped() )
            m_io_service.reset();
        
        if ( m_num_threads == 0 )
            m_num_threads = max( 1u, std::thread::hardware_concurrency() - 1 );

        accept();

        vector<thread*> io_threads;

        for ( uint32_t i = m_num_threads - 1; i > 0; i-- )
        {
            io_threads.push_back( new thread( [this](){ m_io_service.run(); } ));
            DL_DEBUG( "io extra thread started" );
        }

        m_io_service.run();

        for ( vector<thread*>::iterator t = io_threads.begin(); t != io_threads.end(); ++t )
        {
            (*t)->join();
            delete *t;
            DL_DEBUG( "io extra thread stopped" );
        }

        DL_INFO( "io thread stopped" );
    }

    void accept()
    {
        #ifdef USE_TLS

        pSession session = new Session( *this, m_context );

        m_acceptor.async_accept( session->m_socket.lowest_layer(),
            [this, session]( error_code ec )
                {
                    if ( !ec )
                    {
                        DL_INFO( "New connection from " << session->remoteAddress() );

                        unique_lock<mutex>  lock( m_data_mutex );
                        m_sessions.insert( session );
                        lock.unlock();

                        session->start();
                    }
                    else
                    {
                        delete session;
                    }

                    accept();
                });

        #else

        m_acceptor.async_accept( m_socket, [this]( error_code ec )
        {
            if ( !ec )
            {
                Session *session = new Session( *this, move( m_socket ));
                DL_INFO( "New connection from " << session->remoteAddress() );

                unique_lock<mutex>  lock( m_data_mutex );
                m_sessions.insert( session );
                lock.unlock();

                session->start();
            }

            accept();
        });

        #endif
    }

    void backgroundMaintenance()
    {
        DL_DEBUG( "Maint thread started" );

        struct timespec             t;
        set<spSession>::iterator    isess;
        //vector<spSession>           dead_sessions;

        dead_sessions.reserve( 10 );

        while( m_io_running )
        {
            sleep( MAINT_POLL_INTERVAL );

            lock_guard<mutex> lock( m_data_mutex );

            clock_gettime( CLOCK_REALTIME, &t );

            for ( isess = m_sessions.begin(); isess != m_sessions.end(); )
            {
                if (( t.tv_sec - (*isess)->m_last_access.tv_sec ) + (( t.tv_nsec - (*isess)->m_last_access.tv_nsec ) * 1.0e-9 ) > CLIENT_IDLE_TIMEOUT )
                {
                    isess = m_sessions.erase( isess );
                }
                else
                    ++isess;
            }

/*
            for ( isess = dead_sessions.begin(); isess != dead_sessions.end(); ++isess )
            {
                DL_INFO( "Deleting inactive client " << *isess );
                delete *isess;
            }

            dead_sessions.clear();
*/
        }
        DL_DEBUG( "Maint thread stopped" );
    }


    string                      m_host;
    uint32_t                    m_port;
    uint32_t                    m_timeout;
    thread *                    m_io_thread;
    thread *                    m_maint_thread;
    uint32_t                    m_num_threads;
    mutex                       m_api_mutex;
    mutex                       m_data_mutex;
    bool                        m_io_running;
    condition_variable          m_router_cvar;
    asio::io_service            m_io_service;
    asio::ip::tcp::endpoint     m_endpoint;
    asio::ip::tcp::acceptor     m_acceptor;
    #ifdef USE_TLS
    asio::ssl::context          m_context;
    #else
    asio::ip::tcp::socket       m_socket;
    #endif
    set<spSession>              m_sessions;

    friend class Session;
};

// ========== Server Wrapper Class ==========

Server::Server( uint32_t a_port, uint32_t a_timeout, uint32_t a_num_threads )
{
    m_impl = new ServerImpl( a_port, a_timeout, a_num_threads );
}

Server::~Server()
{
    m_impl->stop( false );
    delete m_impl;
}

void
Server::run( bool a_async )
{
    m_impl->run( a_async );
}

void
Server::stop( bool a_wait )
{
    m_impl->stop( a_wait );
}

void
Server::wait()
{
    m_impl->wait();
}


}}
