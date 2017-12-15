/*
GLOBUS_GSI_AUTHZ_SYSTEM_INIT           /opt/sdms/libsdms_gsi_authz  sdms_gsi_authz_init
GLOBUS_GSI_AUTHZ_SYSTEM_DESTROY        /opt/sdms/libsdms_gsi_authz  sdms_gsi_authz_destroy
GLOBUS_GSI_AUTHZ_HANDLE_INIT           /opt/sdms/libsdms_gsi_authz  sdms_gsi_authz_handle_init
GLOBUS_GSI_AUTHORIZE_ASYNC             /opt/sdms/libsdms_gsi_authz  sdms_gsi_authz_authorize_async
GLOBUS_GSI_AUTHZ_CANCEL                /opt/sdms/libsdms_gsi_authz  sdms_gsi_authz_cancel
GLOBUS_GSI_AUTHZ_HANDLE_DESTROY        /opt/sdms/libsdms_gsi_authz  sdms_gsi_authz_handle_destroy
GLOBUS_GSI_GET_AUTHORIZATION_IDENTITY  /opt/sdms/libsdms_gsi_authz  sdms_gsi_authz_identify
*/

#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <syslog.h>
#include <stdbool.h>

//#include <curl/curl.h>
#include <mysql.h>

#include <globus_types.h>
#include <gssapi.h>

MYSQL * g_mysql = 0;

// Must define these here b/c globus doesn't seem to provide dev headers for GSI authz
typedef void * globus_gsi_authz_handle_t;
typedef void (* globus_gsi_authz_cb_t)( void * callback_arg, globus_gsi_authz_handle_t handle, globus_result_t result ); 


static gss_ctx_id_t current_context = GSS_C_NO_CONTEXT;

// TODO This value must be pulled from server config (max concurrency)
#define MAX_ACTIVE_CTX 25

// TODO This is a brute-force context lookup solution. Needs to be replaced with an indexed look-up
struct ContextHandleEntry
{
    globus_gsi_authz_handle_t   handle;
    gss_ctx_id_t                context;
};

static struct ContextHandleEntry   g_active_contexts[MAX_ACTIVE_CTX];

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

    //curl_global_init(CURL_GLOBAL_ALL);
    if ( mysql_library_init( 0, 0, 0 ))
        syslog( LOG_INFO, "mysql_library_init FAILED" );

    g_mysql = mysql_init(0);

    return 0;
}

globus_result_t
sdms_gsi_authz_destroy()
{
    syslog( LOG_INFO, "sdms_gsi_authz_destroy\n" );

    //curl_global_cleanup();
    mysql_close( g_mysql );

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
    void *                      authz_system_state  = va_arg( ap, void * );

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
    void *                      authz_system_state  = va_arg( ap, void * );

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
    void *                      authz_system_state  = va_arg(ap, void *);

    syslog( LOG_ERR, "handle %p", handle );

    //syslog( LOG_ERR, "sdms_gsi_authz_authorize_async, handle: %p, act: %s, obj: %s", handle, action, object );

    OM_uint32 min_stat;
    gss_name_t src_name = GSS_C_NO_NAME;
    gss_name_t targ_name = GSS_C_NO_NAME;

    gss_ctx_id_t context = findContext( handle );
    if ( context != 0 )
    {
        OM_uint32 maj_stat = gss_inquire_context( &min_stat, context, &src_name, &targ_name, 0, 0, 0, 0, 0 );
        if ( maj_stat == GSS_S_COMPLETE )
        {
            gss_buffer_desc  src_name_buf = GSS_C_EMPTY_BUFFER;
            gss_OID src_name_type;

            maj_stat = gss_display_name( &min_stat, src_name, &src_name_buf, &src_name_type );
            if ( maj_stat == GSS_S_COMPLETE )
            {
                gss_buffer_desc targ_name_buf = GSS_C_EMPTY_BUFFER;
                gss_OID targ_name_type;

                maj_stat = gss_display_name( &min_stat, targ_name, &targ_name_buf, &targ_name_type );
                if ( maj_stat == GSS_S_COMPLETE )
                {
                    syslog( LOG_INFO, "gss_inquire_context, src: %s, targ: %s", (char*)src_name_buf.value, (char*)targ_name_buf.value );

                    if ( strcmp( (char*)src_name_buf.value, "/O=Grid/OU=GlobusTest/OU=simpleCA-daedalus/OU=Globus Simple CA/CN=Dale Stansberry" ) == 0 )
                        result = GLOBUS_SUCCESS;

                    gss_release_buffer( &min_stat, &targ_name_buf );
                }
                else
                {
                    syslog( LOG_ERR, "gss_display_name target FAILED, maj: %d, min: %d", maj_stat, min_stat );
                }

                gss_release_buffer( &min_stat, &src_name_buf );
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

    callback(callback_arg, handle, result);

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
    syslog( LOG_INFO, "sdms_gsi_authz_identify\n" );
    return 0;
}

