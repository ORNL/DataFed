
// Local private includes
#include "AuthzLog.h"
#include "AuthzWorker.h"
#include "Config.h"
#include "Util.h"

// Globus third party includes
#include <globus_error_hierarchy.h>
#include <globus_thread.h>
#include <globus_types.h>
#include <gssapi.h>

// Standard includes
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef void *globus_gsi_authz_handle_t;
typedef void (*globus_gsi_authz_cb_t)(void *callback_arg,
                                      globus_gsi_authz_handle_t handle,
                                      globus_result_t result);

gss_ctx_id_t findContext(globus_gsi_authz_handle_t a_handle);
bool setContext(globus_gsi_authz_handle_t a_handle, gss_ctx_id_t a_ctx);
bool clearContext(globus_gsi_authz_handle_t a_handle);

// TODO This value must be pulled from server config (max concurrency)
#define MAX_ACTIVE_CTX 25

struct ContextHandleEntry {
  globus_gsi_authz_handle_t handle;
  gss_ctx_id_t context;
};

static struct ContextHandleEntry g_active_contexts[MAX_ACTIVE_CTX];

gss_ctx_id_t findContext(globus_gsi_authz_handle_t a_handle) {
  struct ContextHandleEntry *c = &g_active_contexts[0];
  struct ContextHandleEntry *e = c + MAX_ACTIVE_CTX;
  for (; c != e; ++c) {
    if (c->handle == a_handle)
      return c->context;
  }

  return 0;
}

bool setContext(globus_gsi_authz_handle_t a_handle, gss_ctx_id_t a_ctx) {
  struct ContextHandleEntry *c = &g_active_contexts[0];
  struct ContextHandleEntry *e = c + MAX_ACTIVE_CTX;
  for (; c != e; ++c) {
    if (c->handle == 0) {
      c->handle = a_handle;
      c->context = a_ctx;
      return false;
    }
  }

  return true;
}

bool clearContext(globus_gsi_authz_handle_t a_handle) {
  struct ContextHandleEntry *c = &g_active_contexts[0];
  struct ContextHandleEntry *e = c + MAX_ACTIVE_CTX;
  for (; c != e; ++c) {
    if (c->handle == a_handle) {
      c->handle = c->context = 0;
      return false;
    }
  }

  return true;
}

// The same
globus_result_t gsi_authz_init() {
  AUTHZ_LOG_DEBUG("gsi_authz_init\n");
  memset(g_active_contexts, 0, sizeof(g_active_contexts));

  // This line is different
  if (initializeGlobalConfig()) {
    return GLOBUS_FAILURE;
  }

  return GLOBUS_SUCCESS;
}

// The same
globus_result_t gsi_authz_destroy() {
  AUTHZ_LOG_DEBUG("gsi_authz_destroy\n");
  AUTHZ_LOG_CLOSE();
  return 0;
}

// The same
globus_result_t gsi_authz_handle_init(va_list ap) {
  AUTHZ_LOG_DEBUG("gsi_authz_handle_init\n");

  globus_result_t result = GLOBUS_FAILURE;
  globus_gsi_authz_handle_t *handle = va_arg(ap, globus_gsi_authz_handle_t *);
  char *service_name = va_arg(ap, char *);
  gss_ctx_id_t context = va_arg(ap, gss_ctx_id_t);
  globus_gsi_authz_cb_t callback = va_arg(ap, globus_gsi_authz_cb_t);
  void *callback_arg = va_arg(ap, void *);

  // Unused arguments
  (void)service_name;

  if (findContext(*handle) == 0) {
    if (setContext(*handle, context) == false)
      result = GLOBUS_SUCCESS;
    else
      AUTHZ_LOG_ERROR("gsi_authz_handle_init out of handle context space\n");
  } else {
    AUTHZ_LOG_DEBUG(
        "gsi_authz_handle_init context handle already initialized\n");
  }

  callback(callback_arg, callback_arg, result);

  return result;
}

// The same
globus_result_t gsi_authz_handle_destroy(va_list ap) {
  AUTHZ_LOG_INFO("gsi_authz_handle_destroy\n");

  globus_result_t result = GLOBUS_FAILURE;
  globus_gsi_authz_handle_t handle = va_arg(ap, globus_gsi_authz_handle_t);
  globus_gsi_authz_cb_t callback = va_arg(ap, globus_gsi_authz_cb_t);
  void *callback_arg = va_arg(ap, void *);
  // void *                      authz_system_state  = va_arg( ap, void * );

  // syslog( LOG_ERR, "handle %p", handle );

  if (clearContext(handle) == false) {
    result = GLOBUS_SUCCESS;
  } else {
    AUTHZ_LOG_ERROR("gsi_authz_handle_destroy context handle lookup FAILED\n");
  }

  callback(callback_arg, handle, result);

  return result;
}

globus_result_t gsi_authz_authorize_async(va_list ap) {
  AUTHZ_LOG_INFO("gsi_authz_authorize_async\n");

  globus_result_t result = GLOBUS_FAILURE;
  globus_gsi_authz_handle_t handle = va_arg(ap, globus_gsi_authz_handle_t);
  char *action = va_arg(ap, char *);
  char *object = va_arg(ap, char *);
  globus_gsi_authz_cb_t callback = va_arg(ap, globus_gsi_authz_cb_t);
  void *callback_arg = va_arg(ap, void *);
  // void *                      authz_system_state  = va_arg(ap, void *);
  char *callout_ids1 = getenv("GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS");
  char *callout_username_mapped1 = getenv("GLOBUS_GRIDFTP_MAPPED_USERNAME");
  char *callout_id_mapped1 = getenv("GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID");

  AUTHZ_LOG_DEBUG("gsi_authz_authorize_async GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS: %s\n",
                  callout_ids1);
  AUTHZ_LOG_DEBUG("gsi_authz_authorize_async GLOBUS_GRIDFTP_MAPPED_USERNAME: %s\n",
                  callout_username_mapped1);
  AUTHZ_LOG_DEBUG("gsi_authz_authorize_async GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID: %s\n",
                  callout_id_mapped1);

  char globus_collection_path[MAX_PATH_LEN];
  getConfigVal("globus_collection_path", globus_collection_path, MAX_PATH_LEN);
  AUTHZ_LOG_INFO("Allowed collection path: %s, action: %s, object is %s\n",
                 globus_collection_path, action, object);
  globus_thread_t thread_id = globus_thread_self();
  AUTHZ_LOG_INFO("Thread id is: %p\n", (void *)thread_id.dummy);
  AUTHZ_LOG_ERROR("gsi_authz_authorize_async, handle: %p, act: %s, obj: %s\n",
                  handle, action, object);

  OM_uint32 min_stat;
  gss_name_t client = GSS_C_NO_NAME;
  gss_name_t target = GSS_C_NO_NAME;

  gss_ctx_id_t context = findContext(handle);
  if (context != 0) {
    OM_uint32 maj_stat = gss_inquire_context(&min_stat, context, &client,
                                             &target, 0, 0, 0, 0, 0);
    if (maj_stat == GSS_S_COMPLETE) {
      gss_buffer_desc client_buf = GSS_C_EMPTY_BUFFER;
      gss_OID client_type;

      maj_stat = gss_display_name(&min_stat, client, &client_buf, &client_type);
      if (maj_stat == GSS_S_COMPLETE) {
        gss_buffer_desc target_buf = GSS_C_EMPTY_BUFFER;
        gss_OID target_type;

        maj_stat =
            gss_display_name(&min_stat, target, &target_buf, &target_type);
        if (maj_stat == GSS_S_COMPLETE) {
          AUTHZ_LOG_INFO("Auth client: %s, file: %s, action: %s\n",
                         (char *)client_buf.value, object, action);

// Testing hack
#if 0
                    //if ( strcmp( (char*)client_buf.value, "/C=US/O=Globus Consortium/OU=Globus Connect User/CN=u_eiiq2lgi7fd7jfaggqdmnijiya" ) == 0 )
                    {
                        result = GLOBUS_SUCCESS;
                        callback(callback_arg, handle, result);
                        return result;
                    }
#endif

          // if ( strncmp( (char*)client_buf.value, "/C=US/O=Globus
          // Consortium/OU=Globus Connect User/CN=", 52 ) != 0 )
          if (strncmp((char *)client_buf.value,
                      "/C=US/O=Globus Consortium/OU=Globus", 35) != 0) {
            AUTHZ_LOG_ERROR("Invalid certificate subject prefix: %s\n",
                            (char *)client_buf.value);
          } else {
            /* Note: For some reason, globus will provide the CN as either a
             * UUID that is linked to the client's account and encoded in
             * base32, OR it will simply provide the client's GlobusID username
             * (possibly depending on how the user authenticated). So, this code
             * attempts to detect the two different cases by looking for a "u_"
             * prefix which seems to be associated with the encoded UUID.*/

            char *client_id = 0;

            // TODO Should check client uuid str len to make sure it won't
            // overflow
            if (strncmp((char *)client_buf.value + 52, "u_", 2) == 0) {
              AUTHZ_LOG_INFO("Globus user prefix detected, decode UUID\n");

              client_id = malloc(40);

              if (!decodeUUID((char *)client_buf.value + 54, client_id)) {
                AUTHZ_LOG_ERROR("Failed to decode subject UUID: %s\n",
                                (char *)client_buf.value + 54);
                free(client_id);
                client_id = 0;
              }
            } else {
              AUTHZ_LOG_INFO("Using client CN for authz\n");

              // Find "/CN=" in cert DN
              const char *cn = strstr(client_buf.value, "/CN=");
              if (!cn) {
                AUTHZ_LOG_ERROR("Common Name not found in client DN\n");
              } else {
                client_id = strdup((char *)cn + 4);
              }

              char *callout_ids = getenv("GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS");
              char *callout_id_mapped =
                  getenv("GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID");

              if (callout_ids != NULL) {
                AUTHZ_LOG_DEBUG(
                    "gsi_authz_authorize_async GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS: %s\n",
                    callout_ids);
                client_id = strdup(callout_ids);
                AUTHZ_LOG_INFO("libauthz.c client_id(s): %s\n", client_id);
              } else if (callout_id_mapped != NULL) {
                AUTHZ_LOG_DEBUG(
                    "gsi_authz_authorize_async GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID: %s\n",
                    callout_id_mapped);
                client_id = strdup(callout_id_mapped);
              } else {
                AUTHZ_LOG_ERROR(
                    "gsi_authz_authorize_async GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS.\n");
              }
            }

            if (client_id) {
              struct Config config = createLocalConfigCopy();
              AUTHZ_LOG_INFO("gsi_authz_authorize_async client_id: %s, file: %s, action: "
                             "%s log_file path: %s\n",
                             client_id, object, action, config.log_path);

              // NOTE - Globus stores thread ids as a pointer, using an int to
              // represent this is non ideal because it will be truncated on
              // conversion.
              if (checkAuthorization(client_id, object, action, config,
                                     (int)thread_id.dummy) == 0) {
                result = GLOBUS_SUCCESS;
              } else {

                AUTHZ_LOG_INFO(
                    "gsi_authz_authorize_async client_id: %s, file: %s, action: %s, status: FALIED, msg: checkAuthorization command failed\n",
                    client_id, object, action);
              }

              free(client_id);
            }
          }

          gss_release_buffer(&min_stat, &target_buf);
        } else {
          AUTHZ_LOG_ERROR("gsi_authz_authorize_async path: %s, action: %s, object: %s, status: FAILED, msg: gss_display_name target FAILED, maj: %d, min: %d\n", globus_collection_path, action, object,
                          maj_stat, min_stat);
        }

        gss_release_buffer(&min_stat, &client_buf);
      } else {
        AUTHZ_LOG_ERROR("gsi_authz_authorize_async path: %s, action: %s, object: %s, status: FAILED, msg: gss_display_name source FAILED, maj: %d, min: %d\n", globus_collection_path, action, object,
                        maj_stat, min_stat);
      }
    } else {
      AUTHZ_LOG_ERROR("gsi_authz_authorize_async path: %s, action: %s, object: %s, status: FAILED, msg: gss_inquire_context FAILED, maj: %d, min: %d\n", globus_collection_path, action, object,
                      maj_stat, min_stat);
    }
  } else {
    AUTHZ_LOG_ERROR("gsi_authz_authorize_async path: %s, action: %s, object: %s, status: FAILED, msg: context handle\n", globus_collection_path, action, object);
  }

  if (result != GLOBUS_SUCCESS) {
    globus_object_t *error = globus_error_construct_no_authentication(0, 0);

    AUTHZ_LOG_INFO("gsi_authz_authorize_async path: %s, action: %s, object: %s, status: FAILED\n", globus_collection_path, action, object);
    result = globus_error_put(error);
  } else {
    AUTHZ_LOG_INFO("gsi_authz_authorize_async path: %s, action: %s, object: %s, status: PASSED\n", globus_collection_path, action, object);
    callback(callback_arg, handle, result);
  }

  return result;
}

// The same
globus_result_t gsi_authz_cancel() {
  AUTHZ_LOG_DEBUG("gsi_authz_cancel\n");
  return 0;
}

// The same
globus_result_t gsi_authz_identify() {
  AUTHZ_LOG_DEBUG("gsi_authz_identify\n");
  return 0;
}

globus_result_t gsi_map_user(va_list Ap) {
  AUTHZ_LOG_DEBUG("gsi_map_user\n");

  char *service = NULL;
  char *desired_identity = NULL;
  char *identity_buffer = NULL;
  unsigned int buffer_length = 0;
  gss_ctx_id_t context;

  context = va_arg(Ap, gss_ctx_id_t);
  service = va_arg(Ap, char *);
  desired_identity = va_arg(Ap, char *);
  identity_buffer = va_arg(Ap, char *);
  buffer_length = va_arg(Ap, unsigned int);

  (void)context;
  (void)desired_identity;
  (void)service;

  memset(identity_buffer, 0, buffer_length);

  char user[MAX_ID_LEN];
  getConfigVal("user", user, MAX_ID_LEN);
  strcat(identity_buffer, user);
  buffer_length = strlen(user);

  return GLOBUS_SUCCESS;
}
