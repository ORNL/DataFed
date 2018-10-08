#ifndef _libsdms_gsi_authz_h_
#define _libsdms_gsi_authz_h_
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <syslog.h>
#include <stdbool.h>
#include <curl/curl.h>
#include <globus_types.h>
#include <globus_error_hierarchy.h>
#include <gssapi.h>

// Must define these here b/c globus doesn't seem to provide dev headers for GSI authz
typedef void * globus_gsi_authz_handle_t;
typedef void (* globus_gsi_authz_cb_t)( void * callback_arg, globus_gsi_authz_handle_t handle, globus_result_t result ); 


gss_ctx_id_t findContext( globus_gsi_authz_handle_t a_handle );
bool setContext( globus_gsi_authz_handle_t a_handle, gss_ctx_id_t a_ctx );
bool clearContext( globus_gsi_authz_handle_t a_handle );
size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata );
globus_result_t  sdms_gsi_authz_init();
globus_result_t sdms_gsi_authz_destroy();
globus_result_t  sdms_gsi_authz_handle_init( va_list ap );
globus_result_t  sdms_gsi_authz_handle_destroy( va_list ap );
globus_result_t  sdms_gsi_authz_authorize_async( va_list ap );
globus_result_t  sdms_gsi_authz_cancel();
globus_result_t  sdms_gsi_authz_identify( va_list ap );
globus_result_t  sdms_map_user( va_list Ap );

#endif