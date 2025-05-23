
// Local private includes
#include "AuthzWorker.h"
#include "Config.h"

// Globus third party includes
#include <globus_error_hierarchy.h>
#include <globus_types.h>
#include <gssapi.h>

// Standard includes
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Define LOG_LEVEL and USE_SYSLOG
#define LOG_LEVEL 1

#ifndef DONT_USE_SYSLOG
#define DONT_USE_SYSLOG
#endif

// Define logging macros
#if defined(DONT_USE_SYSLOG)
FILE *log_file = NULL;
bool write_to_file = false;
#define AUTHZ_LOG_DEBUG(fmt, ...)                                              \
  do {                                                                         \
    if (LOG_LEVEL <= 1)                                                        \
      fprintf(stderr, "[DEBUG] " fmt "", ##__VA_ARGS__);                       \
  } while (0);                                                                 \
  do {                                                                         \
    if (LOG_LEVEL <= 1 && write_to_file)                                       \
      fprintf(log_file, "[DEBUG] " fmt "", ##__VA_ARGS__);                     \
  } while (0)
#define AUTHZ_LOG_INFO(fmt, ...)                                               \
  do {                                                                         \
    if (LOG_LEVEL <= 2)                                                        \
      fprintf(stderr, "[INFO] " fmt "", ##__VA_ARGS__);                        \
  } while (0);                                                                 \
  do {                                                                         \
    if (LOG_LEVEL <= 2 && write_to_file)                                       \
      fprintf(log_file, "[INFO] " fmt "", ##__VA_ARGS__);                      \
  } while (0)
#define AUTHZ_LOG_ERROR(fmt, ...)                                              \
  do {                                                                         \
    if (LOG_LEVEL <= 3)                                                        \
      fprintf(stderr, "[ERROR] " fmt "", ##__VA_ARGS__);                       \
    if (LOG_LEVEL <= 3 && write_to_file)                                       \
      fprintf(log_file, "[ERROR] " fmt "", ##__VA_ARGS__);                     \
  } while (0)
#define AUTHZ_LOG_INIT(file_path)                                              \
  log_file = fopen(file_path, "a");                                            \
  if (log_file != NULL) {                                                      \
    write_to_file = true;                                                      \
  }
#define AUTHZ_LOG_CLOSE()                                                      \
  if (log_file != NULL) {                                                      \
    fclose(log_file);                                                          \
  }
#else
#include <syslog.h>
#define AUTHZ_LOG_DEBUG(fmt, ...)                                              \
  do {                                                                         \
    if (LOG_LEVEL <= 1)                                                        \
      syslog(LOG_DEBUG, "[DEBUG] " fmt, ##__VA_ARGS__);                        \
  } while (0)
#define AUTHZ_LOG_INFO(fmt, ...)                                               \
  do {                                                                         \
    if (LOG_LEVEL <= 2)                                                        \
      syslog(LOG_INFO, "[INFO] " fmt, ##__VA_ARGS__);                          \
  } while (0)
#define AUTHZ_LOG_ERROR(fmt, ...)                                              \
  do {                                                                         \
    if (LOG_LEVEL <= 3)                                                        \
      syslog(LOG_ERR, "[ERROR] " fmt, ##__VA_ARGS__);                          \
  } while (0)
#define AUTHZ_LOG_INIT(file_path) openlog("gsi_authz", 0, LOG_AUTH);
#define AUTHZ_LOG_CLOSE() closelog();
#endif

typedef void *globus_gsi_authz_handle_t;
typedef void (*globus_gsi_authz_cb_t)(void *callback_arg,
                                      globus_gsi_authz_handle_t handle,
                                      globus_result_t result);

gss_ctx_id_t findContext(globus_gsi_authz_handle_t a_handle);
bool setContext(globus_gsi_authz_handle_t a_handle, gss_ctx_id_t a_ctx);
bool clearContext(globus_gsi_authz_handle_t a_handle);

// TODO This value must be pulled from server config (max concurrency)
#define MAX_ACTIVE_CTX 25

void uuidToStr(unsigned char *a_uuid, char *a_out);
bool decodeUUID(const char *a_input, char *a_uuid);

struct ContextHandleEntry {
  globus_gsi_authz_handle_t handle;
  gss_ctx_id_t context;
};

static struct ContextHandleEntry g_active_contexts[MAX_ACTIVE_CTX];

void uuidToStr(unsigned char *a_uuid, char *a_out) {
  static const char *hex = "0123456789abcdef";
  static const char *form = "xxxx-xx-xx-xx-xxxxxx";
  unsigned char *pend = a_uuid + 16;
  char *pout = a_out;
  const char *f = form + 1;

  for (unsigned char *pin = a_uuid; pin != pend; pout += 2, pin++, f++) {
    pout[0] = hex[(*pin >> 4) & 0xF];
    pout[1] = hex[*pin & 0xF];
    if (*f == '-') {
      pout[2] = '-';
      pout++;
      f++;
    }
  }

  pout[0] = 0;
}

bool decodeUUID(const char *a_input, char *a_uuid) {
  static char vocab[33] = "abcdefghijklmnopqrstuvwxyz234567";
  uint64_t word;
  const char *iter;
  const char *end = vocab + 32;
  size_t len = strlen(a_input);
  char c;
  unsigned long v;
  unsigned char out[16];
  unsigned char *outp = out;
  size_t out_len = 0;
  size_t i, j;

  for (i = 0; i < len; i += 8) {
    word = 0;
    for (j = 0; j < 8; ++j) {
      if (i + j < len) {
        c = a_input[i + j];
        for (iter = vocab; iter != end; ++iter) {
          if (*iter == c) {
            v = (iter - vocab);
            break;
          }
        }

        if (iter == end)
          return false;

        word <<= 5;
        word |= v;
      } else {
        word <<= 5 * (8 - j);
        break;
      }
    }

    for (j = 0; j < 5 && out_len < 16; ++j, ++out_len)
      *outp++ = ((word >> ((4 - j) * 8)) & 0xFF);
  }

  uuidToStr(out, a_uuid);

  return true;
}

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

// IMPORTANT: The DATAFED_AUTHZ_CFG_FILE env variable must be set in the gridFTP
// service script (usually /etc/init.d/globus-gridftp-server). This variable
// points to the configuration file used for DataFed comm settings
static struct Config g_config;

// Function to access g_config for testing
struct Config getConfig() {
  return g_config;
}

bool setConfigVal(const char *a_label, char *a_dest, char *a_src,
                  size_t a_max_len) {
  size_t len = strlen(a_src);
  if (len == 0) {
    AUTHZ_LOG_ERROR("DataFed - '%s' value not set.\n", a_label);
    return true;
  }

  if (len > a_max_len) {
    AUTHZ_LOG_ERROR(
        "DataFed - '%s' value too long in authz config file (max %zu).\n",
        a_label, a_max_len);
    return true;
  }

  strcpy(a_dest, a_src);
  AUTHZ_LOG_INFO("Datafed setting src [%s]=%s\n", a_label, a_src);
  AUTHZ_LOG_INFO("Datafed setting dest [%s]=%s\n", a_label, a_dest);

  return false;
}

bool loadKeyFile(char *a_dest, char *a_filename) {
  FILE *inf = fopen(a_filename, "r");

  if (!inf) {
    AUTHZ_LOG_ERROR("DataFed - Could not open key file: %s\n", a_filename);
    return true;
  }

  if (!fgets(a_dest, MAX_KEY_LEN, inf)) {
    AUTHZ_LOG_ERROR("DataFed - Error reading key from file: %s\n", a_filename);
    fclose(inf);
    return true;
  }

  fclose(inf);

  // Strip trailing CR / LF
  a_dest[strcspn(a_dest, "\r\n")] = 0;

  return false;
}

bool loadConfig() {
  AUTHZ_LOG_DEBUG("loadConfig\n");
  const bool error = true;
  memset(&g_config, 0, sizeof(struct Config));

  const char *cfg_file = getenv("DATAFED_AUTHZ_CFG_FILE");

  FILE *inf;
  if (!cfg_file) {
    // If env variable is not set check default location
    inf = fopen("/opt/datafed/authz/datafed-authz.cfg", "r");
    if (!inf) {
      AUTHZ_LOG_ERROR("DataFed - DATAFED_AUTHZ_CFG_FILE env variable not set, "
                      "and datafed-authz.cfg is not located in default "
                      "location /opt/datafed/authz\n");
      return error;
    }
  } else {
    AUTHZ_LOG_INFO("DataFed - Loading authz config file: %s\n", cfg_file);
    inf = fopen(cfg_file, "r");
  }
  fseek(inf, 0, SEEK_SET); // Moves the file pointer to the beginning.
  AUTHZ_LOG_INFO("Config file found.");
  if (inf) {

    AUTHZ_LOG_INFO("Reading config file.");
    size_t MAX_BUF = 1024;
    char buf[MAX_BUF];
    int lc = -1;
    char *val;

    // Default values must be outside the while
    g_config.timeout = 10000;
    g_config.log_path[0] = '\0';
    g_config.user[0] = '\0';
    g_config.repo_id[0] = '\0';
    g_config.server_addr[0] = '\0';
    g_config.pub_key[0] = '\0';
    g_config.globus_collection_path[0] = '\0';
    g_config.priv_key[0] = '\0';
    g_config.server_key[0] = '\0';

    while (1) {
      lc++;

      // Stop at EOF
      if (!fgets(buf, MAX_BUF, inf)) {
        AUTHZ_LOG_INFO("Reading complete.");
        break;
      }

      buf[strcspn(buf, "\r\n")] = 0;

      AUTHZ_LOG_INFO("Buffer is %s\n",buf);
      // Skip comments and blank lines
      if (strlen(buf) == 0 || buf[0] == '#') {
        AUTHZ_LOG_INFO("skipping line: %s", buf);
        continue;
      }

      // Content is formatted as "key=value" (no spaces)
      val = strchr(buf, '=');
      if (!val) {
        AUTHZ_LOG_ERROR(
            "DataFed - Syntax error in authz config file at line %i.\n", lc);
        return error;
      } else {
        *val = 0;
        val++;
      }

      // Default values
      g_config.timeout = 10000;
      g_config.log_path[0] = '\0';

      bool err;
      if (strcmp(buf, "repo_id") == 0) {
        err = setConfigVal("repo_id", g_config.repo_id, val, MAX_ID_LEN);
      } else if (strcmp(buf, "server_address") == 0) {
        err = setConfigVal("server_address", g_config.server_addr, val,
                           MAX_ADDR_LEN);
      } else if (strcmp(buf, "user") == 0) {
        err = setConfigVal("user", g_config.user, val, MAX_ID_LEN);
      } else if (strcmp(buf, "log_path") == 0) {
        err = setConfigVal("log_path", g_config.log_path, val, MAX_PATH_LEN);
        AUTHZ_LOG_INIT(g_config.log_path);
        AUTHZ_LOG_INFO("g_config.log_path is %s\n", g_config.log_path);
      } else if (strcmp(buf, "test_path") == 0) {
        err = setConfigVal("test_path", g_config.test_path, val, MAX_PATH_LEN);
      } else if (strcmp(buf, "globus-collection-path") == 0) {
        err = setConfigVal("globus-collection-path",
                           g_config.globus_collection_path, val, MAX_PATH_LEN);
      } else if (strcmp(buf, "pub_key") == 0) {
        err = loadKeyFile(g_config.pub_key, val);
      } else if (strcmp(buf, "priv_key") == 0) {
        err = loadKeyFile(g_config.priv_key, val);
      } else if (strcmp(buf, "server_key") == 0) {
        err = loadKeyFile(g_config.server_key, val);
      } else if (strcmp(buf, "timeout") == 0) {
        g_config.timeout = atoi(val);
      } else {
        err = true;
        AUTHZ_LOG_ERROR(
            "DataFed - Invalid key, '%s', in authz config file at line %i.\n",
            buf, lc);
      }

      if (err) {
        AUTHZ_LOG_ERROR("Error encountered while reading authz config file: %s\n", buf);
        fclose(inf);
        return error;
      }
    }

    fclose(inf);

    char miss[1024];
    miss[0] = '\0';

    if (g_config.user[0] == '\0')
      strcat(miss, " user");
    if (g_config.repo_id[0] == '\0')
      strcat(miss, " repo_id");
    if (g_config.server_addr[0] == '\0')
      strcat(miss, " server_address");
    if (g_config.pub_key[0] == '\0')
      strcat(miss, " pub_key");
    if (g_config.globus_collection_path[0] == '\0')
      strcat(miss, " globus-collection-path");
    if (g_config.priv_key[0] == '\0')
      strcat(miss, " priv_key");
    if (g_config.server_key[0] == '\0')
      strcat(miss, " server_key");

    // If any of the parameters are missing then there is an error somewhere
    // So if miss is anything other than 0 something is missing.
    if (miss[0] != '\0') {

      AUTHZ_LOG_INFO("DataFed Authz module started, version %s\n",
                     getVersion());
      AUTHZ_LOG_INFO("                         API, version %s\n",
                     getAPIVersion());
      AUTHZ_LOG_INFO("                     Release, version %s\n",
                     getReleaseVersion());

      AUTHZ_LOG_ERROR("DataFed - Missing required authz config items:%s\n",
                      miss);
      return error;
    }
  } else {

    AUTHZ_LOG_INFO("DataFed Authz module started, version %s\n", getVersion());
    AUTHZ_LOG_INFO("                         API, version %s\n",
                   getAPIVersion());
    AUTHZ_LOG_INFO("                     Release, version %s\n",
                   getReleaseVersion());
    AUTHZ_LOG_ERROR("DataFed - Could not open authz config file.\n");

    return error;
  }

  AUTHZ_LOG_INFO("DataFed Authz module started, version %s\n", getVersion());
  AUTHZ_LOG_INFO("                         API, version %s\n", getAPIVersion());
  AUTHZ_LOG_INFO("                     Release, version %s\n",
                 getReleaseVersion());

  return !error;
}

// The same
globus_result_t gsi_authz_init() {
  AUTHZ_LOG_DEBUG("gsi_authz_init\n");
  memset(g_active_contexts, 0, sizeof(g_active_contexts));

  // This line is different
  if (loadConfig()) {
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

  AUTHZ_LOG_DEBUG("libauthz.c GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS: %s\n",
                  callout_ids1);
  AUTHZ_LOG_DEBUG("libauthz.c GLOBUS_GRIDFTP_MAPPED_USERNAME: %s\n",
                  callout_username_mapped1);
  AUTHZ_LOG_DEBUG("libauthz.c GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID: %s\n",
                  callout_id_mapped1);
  AUTHZ_LOG_INFO("Allowed collection path: %s, action: %s, object is %s\n",
                 g_config.globus_collection_path, action, object);

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
                    "libauthz.c GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS: %s\n",
                    callout_ids);
                client_id = strdup(callout_ids);
                AUTHZ_LOG_INFO("libauthz.c client_id(s): %s\n", client_id);
              } else if (callout_id_mapped != NULL) {
                AUTHZ_LOG_DEBUG(
                    "libauthz.c GLOBUS_GRIDFTP_MAPPED_IDENTITY_ID: %s\n",
                    callout_id_mapped);
                client_id = strdup(callout_id_mapped);
              } else {
                AUTHZ_LOG_ERROR(
                    "libauthz.c GLOBUS_GRIDFTP_GUEST_IDENTITY_IDS.\n");
              }
            }

            if (client_id) {
                AUTHZ_LOG_INFO(
                    "libauthz.c checkAuth g_config log_path: %s\n", g_config.log_path);
              if (checkAuthorization(client_id, object, action, &g_config) ==
                  0) {
                result = GLOBUS_SUCCESS;
              } else {

                AUTHZ_LOG_INFO(
                    "libauthz.c Auth client_id: %s, file: %s, action: %s\n",
                    client_id, object, action);
                AUTHZ_LOG_INFO("libauthz.c checkAuthorization FAIL.\n");
              }

              free(client_id);
            }
          }

          gss_release_buffer(&min_stat, &target_buf);
        } else {
          AUTHZ_LOG_ERROR("gss_display_name target FAILED, maj: %d, min: %d\n",
                          maj_stat, min_stat);
        }

        gss_release_buffer(&min_stat, &client_buf);
      } else {
        AUTHZ_LOG_ERROR("gss_display_name source FAILED, maj: %d, min: %d\n",
                        maj_stat, min_stat);
      }
    } else {
      AUTHZ_LOG_ERROR("gss_inquire_context FAILED, maj: %d, min: %d\n",
                      maj_stat, min_stat);
    }
  } else {
    AUTHZ_LOG_ERROR("context handle lookup FAILED\n");
  }

  if (result != GLOBUS_SUCCESS) {
    globus_object_t *error = globus_error_construct_no_authentication(0, 0);
    AUTHZ_LOG_INFO("Authz: FAILED\n");
    result = globus_error_put(error);
  } else {
    AUTHZ_LOG_DEBUG("Authz: PASSED\n");
    callback(callback_arg, handle, result);
  }

  AUTHZ_LOG_ERROR("Authz returning\n");

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
  strcat(identity_buffer, g_config.user);
  buffer_length = strlen(g_config.user);

  return GLOBUS_SUCCESS;
}
