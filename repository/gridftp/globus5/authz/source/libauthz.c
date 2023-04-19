
// Local private includes
#include "AuthzWorker.h"

// Globus third party includes
#include <globus_types.h>
#include <globus_error_hierarchy.h>
#include <gssapi.h>
#include <globus_types.h>
#include <globus_error_hierarchy.h>
#include <gssapi.h>

// Standard includes
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <syslog.h>
#include <stdbool.h>

typedef void * globus_gsi_authz_handle_t;
typedef void (* globus_gsi_authz_cb_t)( void * callback_arg, globus_gsi_authz_handle_t handle, globus_result_t result );


gss_ctx_id_t    findContext( globus_gsi_authz_handle_t a_handle );
bool            setContext( globus_gsi_authz_handle_t a_handle, gss_ctx_id_t a_ctx );
bool            clearContext( globus_gsi_authz_handle_t a_handle );

// TODO This value must be pulled from server config (max concurrency)
#define MAX_ACTIVE_CTX 25

void uuidToStr( unsigned char * a_uuid, char * a_out );
bool decodeUUID( const char * a_input, char * a_uuid );

struct ContextHandleEntry
{
    globus_gsi_authz_handle_t   handle;
    gss_ctx_id_t                context;
};

static struct ContextHandleEntry    g_active_contexts[MAX_ACTIVE_CTX];

void
uuidToStr( unsigned char * a_uuid, char * a_out )
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


bool
decodeUUID( const char * a_input, char * a_uuid )
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


gss_ctx_id_t
findContext( globus_gsi_authz_handle_t a_handle )
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


bool
setContext( globus_gsi_authz_handle_t a_handle, gss_ctx_id_t a_ctx )
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


bool
clearContext( globus_gsi_authz_handle_t a_handle )
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

/**
 * EVERY THING ABOVE IS UNCHANGED
 **/

// IMPORTANT: The DATAFED_AUTHZ_CFG_FILE env variable must be set in the gridFTP service
// script (usually /etc/init.d/globus-gridftp-server). This variable points to the
// configuration file used for DataFed comm settings

static struct Config g_config;

bool
setConfigVal( const char * a_label, char * a_dest, char * a_src, size_t a_max_len )
{
    size_t len = strlen( a_src );

    if ( len == 0 )
    {
        syslog( LOG_ERR, "DataFed - '%s' value not set.", a_label );
        return true;
    }

    if ( len > a_max_len )
    {
        syslog( LOG_ERR, "DataFed - '%s' value too long in authz config file (max %lu).", a_label, a_max_len );
        return true;
    }

    strcpy( a_dest, a_src );

    return false;
}


bool
loadKeyFile( char * a_dest, char * a_filename )
{
    FILE * inf = fopen( a_filename, "r" );

    if ( !inf )
    {
        syslog( LOG_ERR, "DataFed - Could not open key file: %s", a_filename );
        return true;
    }

    if ( !fgets( a_dest, MAX_KEY_LEN, inf ))
    {
        syslog( LOG_ERR, "DataFed - Error reading key from file: %s", a_filename );
        fclose( inf );
        return true;
    }

    fclose( inf );

    // Strip trailing CR / LF
    a_dest[strcspn(a_dest, "\r\n")] = 0;

    return false;
}


bool
loadConfig()
{
    memset( &g_config, 0, sizeof( struct Config ));

    const char * cfg_file = getenv( "DATAFED_AUTHZ_CFG_FILE" );

    FILE * inf;
    if ( !cfg_file )
    {
        // If env variable is not set check default location
        inf = fopen("/opt/datafed/authz/datafed-authz.cfg","r");
        if ( ! inf ) {
          syslog( LOG_ERR, "DataFed - DATAFED_AUTHZ_CFG_FILE env variable not set, and datafed-authz.cfg is not located in default location /opt/datafed/authz" );
          return true;
        }
    } else {
      syslog( LOG_INFO, "DataFed - Loading authz config file: %s", cfg_file );
      inf = fopen( cfg_file, "r" );
    }
    if ( inf )
    {
        size_t MAX_BUF = 1024;
        char buf[MAX_BUF];
        int lc = -1;
        char * val;
        bool err;

        while( 1 )
        {
            lc++;

            // Stop at EOF
            if ( !fgets( buf, MAX_BUF, inf ))
                break;

            buf[strcspn( buf, "\r\n" )] = 0;

            // Skip comments and blank lines
            if ( strlen( buf ) == 0 || buf[0] == '#' )
                continue;

            // Content is formatted as "key=value" (no spaces)
            val = strchr( buf, '=' );
            if ( !val )
            {
                syslog( LOG_ERR, "DataFed - Syntax error in authz config file at line %i.", lc );
                return true;
            }
            else
            {
                *val = 0;
                val++;
            }

            // Default values
            g_config.timeout = 10000;

            if ( strcmp( buf, "repo_id" ) == 0 )
                err = setConfigVal( "repo_id", g_config.repo_id, val, MAX_ID_LEN );
            else if ( strcmp( buf, "server_address" ) == 0 )
                err = setConfigVal( "server_address", g_config.server_addr, val, MAX_ADDR_LEN );
            else if ( strcmp( buf, "user" ) == 0 )
                err = setConfigVal( "user", g_config.user, val, MAX_ID_LEN );
            else if ( strcmp( buf, "test_path" ) == 0 )
                err = setConfigVal( "test_path", g_config.test_path, val, MAX_PATH_LEN );
            else if ( strcmp( buf, "globus-collection-path" ) == 0 )
                err = setConfigVal( "globus-collection-path", g_config.globus_collection_path, val, MAX_PATH_LEN );
            else if ( strcmp( buf, "pub_key" ) == 0 )
                err = loadKeyFile( g_config.pub_key, val );
            else if ( strcmp( buf, "priv_key" ) == 0 )
                err = loadKeyFile( g_config.priv_key, val );
            else if ( strcmp( buf, "server_key" ) == 0 )
                err = loadKeyFile( g_config.server_key, val );
            else if ( strcmp( buf, "timeout" ) == 0 )
                g_config.timeout = atoi(val);
            else
            {
                err = true;
                syslog( LOG_ERR, "DataFed - Invalid key, '%s', in authz config file at line %i.", buf, lc );
            }

            if ( err )
            {
                fclose( inf );
                return true;
            }
        }

        fclose( inf );

        char miss[1024];
        miss[0] = 0;

        if ( g_config.user[0] == 0 )
            strcat( miss, " user" );
        if ( g_config.repo_id[0] == 0 )
            strcat( miss, " repo_id" );
        if ( g_config.server_addr[0] == 0 )
            strcat( miss, " server_address" );
        if ( g_config.pub_key[0] == 0 )
            strcat( miss, " pub_key" );
        if ( g_config.globus_collection_path[0] == 0 )
            strcat( miss, " globus-collection-path" );
        if ( g_config.priv_key[0] == 0 )
            strcat( miss, " priv_key" );
        if ( g_config.server_key[0] == 0 )
            strcat( miss, " server_key" );

        if ( miss[0] != 0 )
        {
            syslog( LOG_ERR, "DataFed - Missing required authz config items:%s", miss );
            return true;
        }
    }
    else
    {
        syslog( LOG_ERR, "DataFed - Could not open authz config file." );
        return true;
    }

    return false;
}

// The same
globus_result_t
gsi_authz_init()
{
    openlog( "gsi_authz", 0, LOG_AUTH );
    syslog( LOG_INFO, "DataFed Authz module started, version %s", getVersion() );
    syslog( LOG_INFO, "                         API, version %s", getAPIVersion() );
    syslog( LOG_INFO, "                     Release, version %s", getReleaseVersion() );
    memset( g_active_contexts, 0, sizeof( g_active_contexts ));

    // This line is different
    if ( loadConfig())
        return GLOBUS_FAILURE;

    return GLOBUS_SUCCESS;
}

// The same
globus_result_t
gsi_authz_destroy()
{
    syslog( LOG_INFO, "gsi_authz_destroy" );

    return 0;
}

// The same
globus_result_t
gsi_authz_handle_init( va_list ap )
{
    syslog( LOG_INFO, "gsi_authz_handle_init" );

    globus_result_t             result              = GLOBUS_FAILURE;
    globus_gsi_authz_handle_t * handle              = va_arg( ap, globus_gsi_authz_handle_t * );
    char *                      service_name        = va_arg( ap, char * );
    gss_ctx_id_t                context             = va_arg( ap, gss_ctx_id_t );
    globus_gsi_authz_cb_t       callback            = va_arg( ap, globus_gsi_authz_cb_t );
    void *                      callback_arg        = va_arg( ap, void * );
    //void *                      authz_system_state  = va_arg( ap, void * );

    // Unused arguments
    (void)service_name;

    //syslog( LOG_ERR, "handle %p", *handle );

    if ( findContext( *handle ) == 0 )
    {
        if ( setContext( *handle, context ) == false )
            result = GLOBUS_SUCCESS;
        else
            syslog( LOG_ERR, "gsi_authz_handle_init out of handle context space" );
    }
    else
    {
        syslog( LOG_ERR, "gsi_authz_handle_init context handle already initialized" );
    }

    //syslog( LOG_ERR, "gsi_authz_handle_init, handle: %p, serv: %s, cb: %p", *handle, service_name, callback );

    callback( callback_arg, callback_arg, result );

    return result;
}

// The same
globus_result_t
gsi_authz_handle_destroy( va_list ap )
{
    syslog( LOG_INFO, "gsi_authz_handle_destroy" );

    globus_result_t             result              = GLOBUS_FAILURE;
    globus_gsi_authz_handle_t   handle              = va_arg( ap, globus_gsi_authz_handle_t );
    globus_gsi_authz_cb_t       callback            = va_arg( ap, globus_gsi_authz_cb_t );
    void *                      callback_arg        = va_arg( ap, void * );
    //void *                      authz_system_state  = va_arg( ap, void * );

    //syslog( LOG_ERR, "handle %p", handle );

    if ( clearContext( handle ) == false )
    {
        result = GLOBUS_SUCCESS;
    }
    else
    {
        syslog( LOG_ERR, "gsi_authz_handle_destroy context handle lookup FAILED" );
    }

    callback( callback_arg, handle, result );

    return result;
}


globus_result_t
gsi_authz_authorize_async( va_list ap )
{
    syslog( LOG_INFO, "gsi_authz_authorize_async" );

    globus_result_t             result              = GLOBUS_FAILURE;
    globus_gsi_authz_handle_t   handle              = va_arg(ap, globus_gsi_authz_handle_t);
    char *                      action              = va_arg(ap, char *);
    char *                      object              = va_arg(ap, char *);
    globus_gsi_authz_cb_t       callback            = va_arg(ap, globus_gsi_authz_cb_t);
    void *                      callback_arg        = va_arg(ap, void *);
    //void *                      authz_system_state  = va_arg(ap, void *);

    if ( strcmp( action, "lookup" ) == 0 || strcmp( action, "chdir" ) == 0  )
    {
        result = GLOBUS_SUCCESS;
        callback(callback_arg, handle, result);
        return result;
    }

    syslog( LOG_ERR, "gsi_authz_authorize_async, handle: %p, act: %s, obj: %s", handle, action, object );

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
                    syslog( LOG_INFO, "Auth client: %s, file: %s, action: %s", (char*)client_buf.value, object, action );

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
                    if ( strncmp( (char*)client_buf.value, "/C=US/O=Globus Consortium/OU=Globus", 35 ) != 0 )
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

                            char* callout_username;
                            callout_username = getenv ("GLOBUS_GRIDFTP_MAPPED_USERNAME");
		
                            char* callout_username_id;
                            callout_username_id = getenv ("GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID");

                            if (callout_username_id !=NULL) {
                              syslog( LOG_INFO, "libauthz.c GLOBUS_GRIDFTP_MAPPED_USERNAME: %s\n",callout_username);
                              syslog( LOG_INFO, "libauthz.c GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID: %s\n",callout_username_id);
                              client_id = strdup(callout_username_id);
                              syslog( LOG_INFO, "libauthz.c client_id: %s\n",client_id);
                            } else {
                              syslog( LOG_ERR, "libauthz.c GLOBUS_GRIDFTP_MAPPED_USERNAME not set.\n");
                            }

                        }

                        if ( client_id )
                        {
                            if ( checkAuthorization( client_id, object, action, &g_config ) == 0 )
                            {
                                result = GLOBUS_SUCCESS;
                            } else {
                    
                                syslog( LOG_INFO, "libauthz.c Auth client_id: %s, file: %s, action: %s", client_id, object, action );
                                syslog( LOG_INFO, "libauthz.c checkAuthorization FAIL.\n");
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
        syslog( LOG_INFO, "Authz: FAILED" );
        result = globus_error_put( error );
    }
    else
    {
        syslog( LOG_ERR, "Authz: PASSED" );
        callback( callback_arg, handle, result );
    }

    syslog( LOG_ERR, "Authz returning" );

    return result;
}

// The same
globus_result_t
gsi_authz_cancel()
{
    syslog( LOG_INFO, "gsi_authz_cancel\n" );
    return 0;
}

// The same
globus_result_t
gsi_authz_identify( va_list ap )
{
    (void)ap;

    syslog( LOG_INFO, "gsi_authz_identify\n" );
    return 0;
}

globus_result_t
gsi_map_user( va_list Ap )
{
    syslog( LOG_INFO, "gsi_map_user" );

    char *          service          = NULL;
    char *          desired_identity = NULL;
    char *          identity_buffer  = NULL;
    unsigned int    buffer_length    = 0;
    gss_ctx_id_t    context;

    context          = va_arg(Ap, gss_ctx_id_t);
    service          = va_arg(Ap, char *);
    desired_identity = va_arg(Ap, char *);
    identity_buffer  = va_arg(Ap, char *);
    buffer_length    = va_arg(Ap, unsigned int);

    (void) context;
    (void) desired_identity;
    (void) service;

    #if 0
    OM_uint32 min_stat;
    gss_name_t client = GSS_C_NO_NAME;
    gss_name_t target = GSS_C_NO_NAME;
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
                syslog( LOG_INFO, "client: %s", (char*)client_buf.value );
            }
        }
    }

    syslog( LOG_INFO, "gsi_map_user request service(%s), user (%s)", service, desired_identity );
    #endif
    memset( identity_buffer, 0, buffer_length );
    strcat( identity_buffer, g_config.user );
    buffer_length = strlen( g_config.user );

    return GLOBUS_SUCCESS;
}
