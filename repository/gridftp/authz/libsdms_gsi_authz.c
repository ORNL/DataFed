#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <syslog.h>
#include <stdbool.h>

#include <curl/curl.h>

#include <globus_types.h>
#include <gssapi.h>


// Must define these here b/c globus doesn't seem to provide dev headers for GSI authz
typedef void * globus_gsi_authz_handle_t;
typedef void (* globus_gsi_authz_cb_t)( void * callback_arg, globus_gsi_authz_handle_t handle, globus_result_t result ); 


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

/**
 * @brief HTTP response buffer write callback
 * @param ptr - Incomming data
 * @param size - Number of data elemenets
 * @param nmemb - Size of a data element (bytes)
 * @param userdata - User-provided data
 * @return Number of bytes consumed
 * 
 * This funciton can be used by the CURL API to receive and store server response data. It is currently not
 * used by this module, but is available if needed in the future.
 */
size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata )
{
    size_t len = size*nmemb;
    strncat( userdata, ptr, len );
    return len;
}


globus_result_t
sdms_gsi_authz_init()
{
    openlog( "sdms_gsi_authz", 0, LOG_AUTH );
    syslog( LOG_INFO, "libsdms_gsi_authz_init\n" );
    memset( g_active_contexts, 0, sizeof( g_active_contexts ));

    curl_global_init(CURL_GLOBAL_ALL);

    return 0;
}

globus_result_t
sdms_gsi_authz_destroy()
{
    syslog( LOG_INFO, "sdms_gsi_authz_destroy\n" );

    curl_global_cleanup();

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
                    syslog( LOG_INFO, "client: %s, target: %s, action: %s", (char*)client_buf.value, (char*)target_buf.value, action );

                    CURL * curl = curl_easy_init();
                    if ( curl )
                    {
                        char url[1024];
                        //char resp[1024];
                        char error[CURL_ERROR_SIZE];

                        url[0] = error[0] = 0;

                        char * esc_client = curl_easy_escape( curl, (char*)client_buf.value, 0 );
                        char * esc_object = curl_easy_escape( curl, object, 0 );
                        
                        strcpy( url, "http://localhost:8529/_db/sdms/api/glb/authz?client=" );
                        strcat( url, esc_client );
                        strcat( url, "&file=" );
                        strcat( url, esc_object );
                        strcat( url, "&act=" );
                        strcat( url, action );

                        syslog( LOG_INFO, "url: %s", url );
                        
                        curl_easy_setopt( curl, CURLOPT_URL, url );
                        curl_easy_setopt( curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
                        curl_easy_setopt( curl, CURLOPT_USERNAME, "root" );
                        curl_easy_setopt( curl, CURLOPT_PASSWORD, "nopass" );
                        //curl_easy_setopt( curl, CURLOPT_WRITEDATA, resp );
                        //curl_easy_setopt( curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
                        curl_easy_setopt( curl, CURLOPT_ERRORBUFFER, error );

                        CURLcode res = curl_easy_perform( curl );

                        long http_code = 0;
                        curl_easy_getinfo( curl, CURLINFO_RESPONSE_CODE, &http_code );

                        if ( res == CURLE_OK )
                        {
                            if ( http_code >= 200 && http_code < 300 )
                            {
                                result = GLOBUS_SUCCESS;
                            }
                            else
                            {
                                syslog( LOG_ERR, "authz call failed, server code %ld", http_code );
                            }
                        }
                        else
                        {
                            syslog( LOG_ERR, "authz call error: %s", error );
                            syslog( LOG_ERR, "curl authz call failed: %s", curl_easy_strerror( res ));
                        }

                        curl_free( esc_client );
                        curl_free( esc_object );
                        curl_easy_cleanup(curl);
                    }
                    else
                    {
                        syslog( LOG_ERR, "curl authz easy init failed!" );
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
    (void)ap;

    syslog( LOG_INFO, "sdms_gsi_authz_identify\n" );
    return 0;
}

