#include <iostream>
#include <fstream>
#include <stdexcept>

#include "unistd.h"
#include "sys/types.h"

#include <zmq.h>
#include <gssapi.h>

#include "Client.hpp"
#include "GSSAPI_Utils.hpp"

using namespace std;

namespace SDMS {
namespace Facility {

#define DEBUG_GSI


class Client::ClientImpl
{
public:
    ClientImpl( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout = 30 ) :
        m_connection( a_server_host, a_server_port, Connection::Client ),
        m_timeout(a_timeout * 1000), m_sec_cred(0), m_sec_ctx(0), m_ctx(1)
    {
        if ( ++m_initialized == 1 )
        {
            if ( globus_module_activate( GLOBUS_GSI_GSSAPI_MODULE ) != GLOBUS_SUCCESS )
                throw runtime_error("failed to activate Globus GSI GSSAPI module");
        }

        OM_uint32 maj_stat, min_stat;

        maj_stat = gss_acquire_cred( &min_stat, GSS_C_NO_NAME, GSS_C_INDEFINITE, GSS_C_NO_OID_SET,
            GSS_C_INITIATE, &m_sec_cred, 0, 0 );

        if ( maj_stat != GSS_S_COMPLETE )
            throw runtime_error( "Unable to acquire valid credentials. Please (re)run grid-proxy-init." );

        #ifdef DEBUG_GSI
        
        gss_name_t          cred_name;

        if ( gss_inquire_cred( &min_stat, m_sec_cred, &cred_name, 0, 0, 0 )!= GSS_S_COMPLETE )
            throw runtime_error("failed to inquire credentials");

        gssString   name_str( cred_name );
        cout << "cred name: " << name_str << "\n";

        #endif
    }

    ~ClientImpl()
    {
        if ( --m_initialized == 0 )
        {
            globus_module_deactivate( GLOBUS_GSI_GSSAPI_MODULE );
        }
    }

    void gssCheckError( OM_uint32 a_maj_stat, OM_uint32 a_min_stat )
    {
        if ( GSS_ERROR( a_maj_stat ))
        {
            string err_msg = globus_error_print_friendly( globus_error_peek( a_min_stat ));

            gss_buffer_desc status_string;
            OM_uint32 d_maj, d_min, msg_ctx;

            do
            {
                d_maj = gss_display_status(
                    &d_min,
                    a_maj_stat,
                    GSS_C_GSS_CODE,
                    GSS_C_NO_OID,
                    &msg_ctx,
                    &status_string );

                err_msg += string("\n") + (char *) status_string.value;
                gss_release_buffer( &d_min, &status_string );
            }
            while ( d_maj & GSS_S_CONTINUE_NEEDED );

            throw runtime_error( err_msg );
        }
    }

    /**
     * @brief Verify server is listening an in-synch
     */
    void ping()
    {
        PingRequest req;
        PingReply * reply;

        req.mutable_header()->set_context( m_ctx );

        Connection::ErrorCode err = m_connection.requestReply<>( req, reply, m_ctx++, m_timeout );
        if ( err != Connection::EC_OK )
            throw runtime_error("Ping failed.");

        delete reply;
#if 0
        msg.mutable_header()->set_context( m_ctx++ );

        if ( m_connection.send( msg ))
        {
            Message*  raw_reply = 0;
            MessageID msg_id = m_connection.recv( raw_reply, m_timeout );

            if ( !msg_id.msg_idx )
                throw runtime_error("Server did not reply.");

            if ( !raw_reply )
                throw runtime_error("Received unregistered reply type.");

            if ( Check( r, raw_reply, PingReply ))
            {
                if ( r->header().context() != msg.header().context() )
                {
                    delete raw_reply;
                    throw runtime_error("Received mismatched message context.");
                }
            }
            else
            {
                delete raw_reply;
                throw runtime_error("Unexpected reply type.");
            }

            delete raw_reply;
        }
        else
            throw runtime_error("Send failed.");
#endif

        #if 0
        cout << "ping\n";

        MsgPing msg( getpid() );

        m_connection.send( msg );

        MessageBuffer reply;
        if ( !m_connection.recv( reply, m_timeout ))
            throw runtime_error("Server did not reply.");

        MsgPing *ping = (MsgPing*)reply.data();

        if ( ping->msg_type != FMT_PING )
            throw runtime_error("Invalid reply from server (wrong type).");

        if ( ping->context != msg.context )
            throw runtime_error("Invalid reply from server (wrong context).");
        #endif
    }

    /**
     * @brief Client-server handshake and certificate exchange
     */
    void login()
    {
        #if 0
        cout << "login\n";

        if ( m_sec_ctx )
            throw runtime_error( "Security context already established." );

        OM_uint32                           maj_stat, min_stat;
        bool loop = true;

        gss_buffer_desc                     init_token = GSS_C_EMPTY_BUFFER;

        gss_buffer_desc                     accept_token = GSS_C_EMPTY_BUFFER;
        gss_ctx_id_t                        accept_ctx = GSS_C_NO_CONTEXT;

        Connection::MsgHeader msg( FMT_LOGIN );
        MessageBuffer reply;
        Connection::MsgHeader *reply_hdr;

        // Initialize securit conext. Must exchange tokens with server until GSS
        // init/accept functions stop generating token data.

        while( loop )
        {
            maj_stat = gss_init_sec_context( &min_stat, m_sec_cred, &m_sec_ctx,
                GSS_C_NO_NAME, GSS_C_NO_OID, 0, 0, GSS_C_NO_CHANNEL_BINDINGS,
                &accept_token, 0, &init_token, 0, 0 );

            gssCheckError( maj_stat, min_stat );

            accept_token.value = NULL;
            accept_token.length = 0;


            if ( init_token.length != 0 )
            {
                cout << "init tok len: " << init_token.length << "\n";

                // Send init token data to server
                msg.data_size = init_token.length;
                m_connection.send( msg, (const char*) init_token.value );

                // Wait for response from server
                if ( !m_connection.recv( reply, m_timeout ))
                    throw runtime_error("Server did not respond.");

                // Process server reply
                reply_hdr = (Connection::MsgHeader*)reply.data();

                switch ( reply_hdr->msg_type )
                {
                case FMT_LOGIN:
                    cout << "data from server\n";
                    accept_token.value = reply.data() + reply_hdr->msg_size;
                    accept_token.length = reply_hdr->data_size;
                    break;

                case FMT_ACK: // Done
                    cout << "done\n";
                    loop = false;
                    break;

                case FMT_NACK: // Failed
                    throw runtime_error("Failed to establish security context with server.");

                default:
                    throw runtime_error("Server responded with invalid reply type.");
                }
            }
        }
        #endif
    }

    void logout()
    {

        #if 0
        cout << "logout\n";

        Connection::MsgHeader msg( FMT_LOGOUT );

        m_connection.send( msg );

        Connection::MsgBuffer reply;
        if ( !m_connection.recv( reply, m_timeout ))
            throw runtime_error("Server did not reply.");

        Connection::MsgHeader *hdr = (Connection::MsgHeader*)reply.data();
        if ( hdr->msg_type != FMT_ACK )
            throw runtime_error("Invalid reply from server (wrong type).");
        #endif
    }

    bool send( Message & a_request, Message *& a_reply, uint32_t a_timeout )
    {
        return false;
    }

private:
    static size_t   m_initialized;  // TODO must be atomic int
    Connection      m_connection;
    uint64_t        m_timeout;
    gss_cred_id_t   m_sec_cred;
    gss_ctx_id_t    m_sec_ctx;
    uint32_t        m_ctx;
};


size_t Client::ClientImpl::m_initialized = 0;




// Class ctor/dtor

Client::Client( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout )
{
    m_impl = new ClientImpl( a_server_host, a_server_port, a_timeout );
}


Client::~Client()
{
    delete m_impl;
}

// Methods (Forward to Impl)

/**
 * @brief Verify server is listening and in-synch
 */
void Client::ping()
{
    m_impl->ping();
}

/**
 * @brief Client-server handshake and certificate exchange
 */
void Client::login()
{
    m_impl->login();
}

void Client::logout()
{
    m_impl->logout();
}

bool Client::send( Message & a_request, Message *& a_reply, uint32_t a_timeout )
{
    return m_impl->send( a_request, a_reply, a_timeout );
}

}}


