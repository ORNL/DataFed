#include <iostream>
#include <fstream>
#include <stdexcept>

#include "unistd.h"
#include "sys/types.h"

#include <zmq.h>

extern "C"
{
    #include <gssapi.h>
}

#include "Client.hpp"
#include "FacilityMsgSchema.hpp"
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
        m_timeout(a_timeout * 1000), m_sec_cred(0), m_sec_ctx(0)
    {
        if ( ++m_initialized == 1 )
        {
            if ( globus_module_activate( GLOBUS_GSI_GSSAPI_MODULE ) != GLOBUS_SUCCESS )
                throw runtime_error("failed to activate Globus GSI GSSAPI module");
        }

        OM_uint32                           maj_stat, min_stat;
#if 0
        struct context_arg *                arg = NULL;
        gss_buffer_desc                     init_token = GSS_C_EMPTY_BUFFER;
        gss_buffer_desc                     accept_token = GSS_C_EMPTY_BUFFER;
        gss_ctx_id_t                        init_ctx = GSS_C_NO_CONTEXT;
        gss_ctx_id_t                        accept_ctx = GSS_C_NO_CONTEXT;
        globus_result_t                     result;
        //globus_gsi_authz_handle_t           authz_handle;
        char                                buf[128];
        char *                              request_action;
        char *                              request_object;
        char *                              identity;
        int                                 ok = -1;
        int                                 fail_count = 0;
        OM_uint32                           message_context;
#endif

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


#if 0
        // Init security context

        do
        {
            maj_stat = gss_init_sec_context(
                &min_stat,
                m_sec_cred,
                &init_ctx,
                GSS_C_NO_NAME,
                GSS_C_NO_OID,
                0,
                0,
                GSS_C_NO_CHANNEL_BINDINGS,
                &accept_token,
                NULL,
                &init_token,
                NULL,
                NULL);

            gssCheckError( maj_stat, min_stat );

            gss_release_buffer( &min_stat, &accept_token );
            accept_token.value = NULL;
            accept_token.length = 0;

            if ( init_token.length != 0 )
            {
                cout << "init tok len: " << init_token.length << "\n";

                maj_stat = gss_accept_sec_context(
                    &min_stat,
                    &accept_ctx,
                    m_sec_cred,
                    &init_token,
                    GSS_C_NO_CHANNEL_BINDINGS,
                    NULL,
                    NULL,
                    &accept_token,
                    NULL,
                    NULL,
                    NULL);
            }
        }
        while (( maj_stat & GSS_S_CONTINUE_NEEDED ) && accept_token.length != 0 );

        if (GSS_ERROR( maj_stat ))
            throw runtime_error("Unable to establish security context");
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
        cout << "ping\n";

        MsgPing msg( getpid() );

        m_connection.send( msg );

        Connection::MsgBuffer reply;
        if ( !m_connection.recv( reply, m_timeout ))
            throw runtime_error("Server did not reply.");

        if ( reply.size() != sizeof( MsgPing ))
            throw runtime_error("Invalid reply from server (wrong size).");

        MsgPing *ping = (MsgPing*)reply.data();

        if ( ping->msg_type != FMT_PING )
            throw runtime_error("Invalid reply from server (wrong type).");

        if ( ping->context != msg.context )
            throw runtime_error("Invalid reply from server (wrong context).");
    }

    /**
     * @brief Client-server handshake and certificate exchange
     */
    void login()
    {
        cout << "login\n";

        if ( m_sec_ctx )
            throw runtime_error( "Security context already established." );

        OM_uint32                           maj_stat, min_stat;

        gss_buffer_desc                     init_token = GSS_C_EMPTY_BUFFER;

        gss_buffer_desc                     accept_token = GSS_C_EMPTY_BUFFER;
        gss_ctx_id_t                        accept_ctx = GSS_C_NO_CONTEXT;

        do
        {
            maj_stat = gss_init_sec_context( &min_stat, m_sec_cred, &m_sec_ctx,
                GSS_C_NO_NAME, GSS_C_NO_OID, 0, 0, GSS_C_NO_CHANNEL_BINDINGS,
                &accept_token, 0, &init_token, 0, 0 );

            gssCheckError( maj_stat, min_stat );



            gss_release_buffer( &min_stat, &accept_token );
            accept_token.value = NULL;
            accept_token.length = 0;

            if ( init_token.length != 0 )
            {
                cout << "init tok len: " << init_token.length << "\n";

                maj_stat = gss_accept_sec_context( &min_stat, &accept_ctx, m_sec_cred,
                    &init_token, GSS_C_NO_CHANNEL_BINDINGS, 0, 0,
                    &accept_token, 0, 0, 0 );
            }
        }
        while (( maj_stat & GSS_S_CONTINUE_NEEDED ) && accept_token.length != 0 );

        if (GSS_ERROR( maj_stat ))
            throw runtime_error("Unable to establish security context");


#if 0
        Connection::MsgHeader msg( FMT_LOGIN, sizeof(Connection::MsgHeader), cert.size() );

        m_connection.send( msg, cert.c_str() );

        Connection::MsgBuffer reply;
        if ( !m_connection.recv( reply, m_timeout ))
            throw runtime_error("Server did not reply.");

        Connection::MsgHeader *reply_hdr = (Connection::MsgHeader*)reply.data();
        cout << "Reply type = " << reply_hdr->msg_type << "\n";
#endif
    }


private:
    static size_t   m_initialized;  // TODO must be atomic int
    Connection      m_connection;
    uint64_t        m_timeout;
    gss_cred_id_t   m_sec_cred;
    gss_ctx_id_t    m_sec_ctx;
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

// Methods

/**
 * @brief Verify server is listening an in-synch
 */
void
Client::ping()
{
    m_impl->ping();
}

/**
 * @brief Client-server handshake and certificate exchange
 */
void
Client::login()
{
    m_impl->login();
}

}}


