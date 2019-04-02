#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <syslog.h>
#include <stdbool.h>
#include <globus_types.h>
#include <globus_error_hierarchy.h>
#include <gssapi.h>
#include "libsdms_gsi_authz.h"
#include "sdms_db_authz.h"

// TODO This value must be pulled from server config (max concurrency)
#define MAX_ACTIVE_CTX 25

void uuidToStr( unsigned char * a_uuid, char * a_out );
bool decodeUUID( const char * a_input, char * a_uuid );

struct ContextHandleEntry
{
    globus_gsi_authz_handle_t   handle;
    gss_ctx_id_t                context;
};
static struct ContextHandleEntry   g_active_contexts[MAX_ACTIVE_CTX];

void uuidToStr( unsigned char * a_uuid, char * a_out )
{
    static const char * hex = "0123456789abcdef";
    static const char * form = "xxxx-xx-xx-xx-xxxxxx";
    unsigned char * pend = a_uuid + 16;
    char * pout = a_out;
    const char * f = form + 1;

    for( unsigned char * pin = a_uuid; pin != pend; pout += 2, pin++, f++ )
    {
        pout[0] = hex[(*pin>>4) & 0xF];
        pout[1] = hex[*pin & 0xF];
        if ( *f == '-' )
        {
            pout[2] = '-';
            pout++;
            f++;
        }
    }

    pout[0] = 0;
}

bool decodeUUID( const char * a_input, char * a_uuid )
{
    static char vocab[33] = "abcdefghijklmnopqrstuvwxyz234567";
    uint64_t word;
    const char * iter;
    const char * end = vocab + 32;
    size_t len = strlen( a_input );
    char c;
    unsigned long v;
    unsigned char out[16];
    unsigned char * outp = out;
    size_t out_len = 0;
    size_t i, j;

    for ( i = 0; i < len; i += 8)
    {
        word = 0;
        for ( j = 0; j < 8; ++j )
        {
            if ( i + j < len )
            {
                c = a_input[i+j];
                for ( iter = vocab; iter != end; ++iter )
                {
                    if ( *iter == c )
                    {
                        v = ( iter - vocab );
                        break;
                    }
                }

                if ( iter == end )
                    return false;

                word <<= 5;
                word |= v;
            }
            else
            {
                word <<= 5*(8-j);
                break;
            }
        }

        for ( j = 0; j < 5 && out_len < 16; ++j, ++out_len )
            *outp++ = ((word >> ((4-j)*8)) & 0xFF);
    }

    uuidToStr( out, a_uuid );

    return true;
}

gss_ctx_id_t findContext( globus_gsi_authz_handle_t a_handle )
{
    struct ContextHandleEntry *c = &g_active_contexts[0];
    struct ContextHandleEntry *e = c + MAX_ACTIVE_CTX;
    for ( ; c != e; ++c )
    {
        if ( c->handle == a_handle )
            return c->context;
    }

    return 0;
}

bool setContext( globus_gsi_authz_handle_t a_handle, gss_ctx_id_t a_ctx )
{
    struct ContextHandleEntry *c = &g_active_contexts[0];
    struct ContextHandleEntry *e = c + MAX_ACTIVE_CTX;
    for ( ; c != e; ++c )
    {
        if ( c->handle == 0 )
        {
            c->handle = a_handle;
            c->context = a_ctx;
            return false;
        }
    }

    return true;
}

bool clearContext( globus_gsi_authz_handle_t a_handle )
{
    struct ContextHandleEntry *c = &g_active_contexts[0];
    struct ContextHandleEntry *e = c + MAX_ACTIVE_CTX;
    for ( ; c != e; ++c )
    {
        if ( c->handle == a_handle )
        {
            c->handle = c->context = 0;
            return false;
        }
    }

    return true;
}

globus_result_t
sdms_gsi_authz_init()
{
    openlog( "sdms_gsi_authz", 0, LOG_AUTH );
    syslog( LOG_INFO, "libsdms_gsi_authz_init\n" );
    memset( g_active_contexts, 0, sizeof( g_active_contexts ));

    return 0;
}

globus_result_t
sdms_gsi_authz_destroy()
{
    syslog( LOG_INFO, "sdms_gsi_authz_destroy\n" );

    return 0;
}


globus_result_t
sdms_gsi_authz_handle_init( va_list ap )
{
    syslog( LOG_INFO, "sdms_gsi_authz_handle_init" );

    globus_result_t             result              = GLOBUS_FAILURE;
    globus_gsi_authz_handle_t * handle              = va_arg( ap, globus_gsi_authz_handle_t * );
    char *                      service_name        = va_arg( ap, char * );
    gss_ctx_id_t                context             = va_arg( ap, gss_ctx_id_t );
    globus_gsi_authz_cb_t       callback            = va_arg( ap, globus_gsi_authz_cb_t );
    void *                      callback_arg        = va_arg( ap, void * );
    //void *                      authz_system_state  = va_arg( ap, void * );

    // Unused arguments
    (void)service_name;

    syslog( LOG_ERR, "handle %p", *handle );

    if ( findContext( *handle ) == 0 )
    {
        if ( setContext( *handle, context ) == false )
            result = GLOBUS_SUCCESS;
        else
            syslog( LOG_ERR, "sdms_gsi_authz_handle_init out of handle context space" );
    }
    else
    {
        syslog( LOG_ERR, "sdms_gsi_authz_handle_init context handle already initialized" );
    }

    //syslog( LOG_ERR, "sdms_gsi_authz_handle_init, handle: %p, serv: %s, cb: %p", *handle, service_name, callback );

    callback( callback_arg, callback_arg, result );

    return result;
}


globus_result_t
sdms_gsi_authz_handle_destroy( va_list ap )
{
    syslog( LOG_INFO, "sdms_gsi_authz_handle_destroy" );

    globus_result_t             result              = GLOBUS_FAILURE;
    globus_gsi_authz_handle_t   handle              = va_arg( ap, globus_gsi_authz_handle_t );
    globus_gsi_authz_cb_t       callback            = va_arg( ap, globus_gsi_authz_cb_t );
    void *                      callback_arg        = va_arg( ap, void * );
    //void *                      authz_system_state  = va_arg( ap, void * );

    syslog( LOG_ERR, "handle %p", handle );

    if ( clearContext( handle ) == false )
    {
        result = GLOBUS_SUCCESS;
    }
    else
    {
        syslog( LOG_ERR, "sdms_gsi_authz_handle_destroy context handle lookup FAILED" );
    }

    callback( callback_arg, handle, result );

    return result;
}


globus_result_t
sdms_gsi_authz_authorize_async( va_list ap )
{
    syslog( LOG_INFO, "sdms_gsi_authz_authorize_async" );

    globus_result_t             result              = GLOBUS_FAILURE;
    globus_gsi_authz_handle_t   handle              = va_arg(ap, globus_gsi_authz_handle_t);
    char *                      action              = va_arg(ap, char *);
    char *                      object              = va_arg(ap, char *);
    globus_gsi_authz_cb_t       callback            = va_arg(ap, globus_gsi_authz_cb_t);
    void *                      callback_arg        = va_arg(ap, void *);
    //void *                      authz_system_state  = va_arg(ap, void *);

    syslog( LOG_ERR, "handle %p", handle );
    
    if ( strcmp( action, "lookup" ) == 0 || strcmp( action, "chdir" ) == 0  )
    {
        result = GLOBUS_SUCCESS;
        callback(callback_arg, handle, result);
        return result;
    }

    //syslog( LOG_ERR, "sdms_gsi_authz_authorize_async, handle: %p, act: %s, obj: %s", handle, action, object );
    
    // TODO - Everything below must all be done on a worker thread
    
    OM_uint32 min_stat;
    gss_name_t client = GSS_C_NO_NAME;
    gss_name_t target = GSS_C_NO_NAME;

    gss_ctx_id_t context = findContext( handle );
    if ( context != 0 )
    {
        OM_uint32 maj_stat = gss_inquire_context( &min_stat, context, &client, &target, 0, 0, 0, 0, 0 );
        if ( maj_stat == GSS_S_COMPLETE )
        {
            gss_buffer_desc  client_buf = GSS_C_EMPTY_BUFFER;
            gss_OID client_type;

            maj_stat = gss_display_name( &min_stat, client, &client_buf, &client_type );
            if ( maj_stat == GSS_S_COMPLETE )
            {
                gss_buffer_desc target_buf = GSS_C_EMPTY_BUFFER;
                gss_OID target_type;

                maj_stat = gss_display_name( &min_stat, target, &target_buf, &target_type );
                if ( maj_stat == GSS_S_COMPLETE )
                {
                    syslog( LOG_INFO, "client: %s, file: %s, action: %s", (char*)client_buf.value, object, action );

                    // Testing hack
                    #if 0
                    //if ( strcmp( (char*)client_buf.value, "/C=US/O=Globus Consortium/OU=Globus Connect User/CN=u_eiiq2lgi7fd7jfaggqdmnijiya" ) == 0 )
                    {
                        result = GLOBUS_SUCCESS;
                        callback(callback_arg, handle, result);
                        return result;
                    }
                    #endif

                    //if ( strncmp( (char*)client_buf.value, "/C=US/O=Globus Consortium/OU=Globus Connect User/CN=", 52 ) != 0 )
                    if ( strncmp( (char*)client_buf.value, "/C=US/O=Globus Consortium/OU=Globus", 36 ) != 0 )
                    {
                        syslog( LOG_ERR, "Invalid certificate subject prefix: %s", (char*)client_buf.value );
                    }
                    else
                    {
                        /* Note: For some reason, globus will provide the CN as either a UUID that is linked to the client's account and encoded in base32, OR it will simply provide the client's GlobusID username (possibly depending on how the user authenticated). So, this code attempts to detect the two different cases by looking for a "u_" prefix which seems to be associated with the encoded UUID.*/

                        char * client_id = 0;

                        // TODO Should check client uuid str len to make sure it won't overflow
                        if ( strncmp( (char*)client_buf.value + 52, "u_", 2 ) == 0 )
                        {
                            syslog( LOG_INFO, "Globus user prefix detected, decode UUID" );

                            client_id = malloc( 40 );

                            if ( !decodeUUID( (char*)client_buf.value + 54, client_id ))
                            {
                                syslog( LOG_ERR, "Failed to decode subject UUID: %s", (char*)client_buf.value + 54 );
                                free( client_id );
                                client_id = 0;
                            }
                        }
                        else
                        {
                            syslog( LOG_INFO, "Using client CN for authz" );
                            // Find "/CN=" in cert DN
                            const char * cn = strstr( client_buf.value, "/CN=" );
                            if ( !cn )
                                syslog( LOG_ERR, "Common Name not found in client DN" );
                            else
                                client_id = strdup( (char*)cn + 4 );
                        }

                        if ( client_id )
                        {
                            syslog( LOG_DEBUG, "Client ID (CN/UUID): %s", client_id );

                            if (authzdb(client_id, object, action) == 0 )
                            {
                                result = GLOBUS_SUCCESS;
                                syslog( LOG_INFO, "DataFed core authz PASSED" );
                            }
                            else
                            {
                                syslog( LOG_ERR, "DataFed core authz FAILED" );
                            }

                            free( client_id );
                        }
                    }

                    gss_release_buffer( &min_stat, &target_buf );
                }
                else
                {
                    syslog( LOG_ERR, "gss_display_name target FAILED, maj: %d, min: %d", maj_stat, min_stat );
                }

                gss_release_buffer( &min_stat, &client_buf );
            }
            else
            {
                syslog( LOG_ERR, "gss_display_name source FAILED, maj: %d, min: %d", maj_stat, min_stat );
            }
        }
        else
        {
            syslog( LOG_ERR, "gss_inquire_context FAILED, maj: %d, min: %d", maj_stat, min_stat );
        }
    }
    else
    {
        syslog( LOG_ERR, "context handle lookup FAILED" );
    }

    if ( result != GLOBUS_SUCCESS )
    {
        globus_object_t * error = globus_error_construct_no_authentication( 0, 0 );
        //globus_module_descriptor_t * base_source,
        //globus_object_t * base_cause);

        syslog( LOG_INFO, "Authz final: PASSED" );
        result = globus_error_put( error );
    }
    else
    {
        syslog( LOG_ERR, "Authz final: FAILED" );
        callback( callback_arg, handle, result );
    }

    return result;
}

globus_result_t
sdms_gsi_authz_cancel()
{
    syslog( LOG_INFO, "sdms_gsi_authz_cancel\n" );
    return 0;
}


globus_result_t
sdms_gsi_authz_identify( va_list ap )
{
    (void)ap;

    syslog( LOG_INFO, "sdms_gsi_authz_identify\n" );
    return 0;
}

globus_result_t
sdms_map_user( va_list Ap )
{
    syslog( LOG_INFO, "sdms_map_user" );

    //char *          users_dn         = NULL;
    //char            translated_dn[MAX_DN_LENGTH];
    char *          service          = NULL;
    char *          desired_identity = NULL;
    char *          identity_buffer  = NULL;
    //char *          shared_user_cert = NULL;
    unsigned int    buffer_length    = 0;
    gss_ctx_id_t    context;

    context          = va_arg(Ap, gss_ctx_id_t);
    service          = va_arg(Ap, char *);
    desired_identity = va_arg(Ap, char *);
    identity_buffer  = va_arg(Ap, char *);
    buffer_length    = va_arg(Ap, unsigned int);
    //shared_user_cert = va_arg(Ap, char *);

    (void) context;

    syslog( LOG_INFO, "sdms_map_user request service(%s), user (%s)", service, desired_identity );
    //syslog( LOG_INFO, "sdms_map_user request service(%s), user (%s), shared(%s)", service, desired_identity, shared_user_cert );

    strncpy( identity_buffer, "cades", buffer_length );
    buffer_length = 5;

    return GLOBUS_SUCCESS;
}
