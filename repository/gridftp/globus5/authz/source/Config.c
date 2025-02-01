
// Local private includes
#include "Config.h"
#include "AuthzLog.h"

// Standard includes
#include <ctype.h>
#include <pthread.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

// IMPORTANT: The DATAFED_AUTHZ_CFG_FILE env variable must be set in the gridFTP
// service script (usually /etc/init.d/globus-gridftp-server). This variable
// points to the configuration file used for DataFed comm settings

/******************************************************************************
 * Global Vars
 ******************************************************************************/
// Define the global configuration object
static struct Config g_config;
// Boolean value is used to control initialization of the global config
// structure false means it has not yet been initialized and true means it has
// already been initialized
static bool config_loaded = false;

// Used to control the output of log messages and prevent initialization
// messaged from reappearing
static bool first_run = true;

// Initialize the read-write lock for the configuration object
pthread_rwlock_t config_rwlock = PTHREAD_RWLOCK_INITIALIZER;
/******************************************************************************
 * File Scoped Vars
 ******************************************************************************/
// Config file has the following format
//
// key=value
//
// i.e.
// fruit=banana
//
// This three constants define the max char limit for key and the value
#define CONFIG_FILE_MAX_KEY_CHAR_SIZE 256
#define CONFIG_FILE_MAX_VALUE_CHAR_SIZE 768
// 256 + 768 = 1024
#define CONFIG_FILE_MAX_LINE_LEN 1024

/******************************************************************************
 * File Scoped Functions
 ******************************************************************************/

/**
 * @brief Sets a value to a destination buffer with length checks.
 *
 * This function copies a source string (`a_src`) to a destination buffer
 * (`a_dest`) while ensuring the length of the source string does not exceed the
 * maximum allowed length
 * (`a_max_len`). If the source string is empty or too long, an error is logged,
 * and the function returns `true`. Otherwise, the source string is copied to
 * the destination.
 *
 * @param a_label The label associated with the configuration value, used in
 * error logs.
 * @param a_dest A pointer to the destination buffer where the source string
 * will be copied.
 * @param a_src A pointer to the source string to be copied to the destination
 * buffer.
 * @param a_max_len The maximum allowable length for the destination buffer.
 *
 * @return `true` if an error occurred (e.g., empty source or source too long),
 * `false` otherwise.
 *
 * @note The function uses `strncpy` to copy the source string into the
 * destination buffer, ensuring that no more than `a_max_len` characters are
 * copied. If the source string is longer than the allowed maximum length, an
 * error is logged, and the value is not copied.
 */
bool setConfigValInternal(const char *a_label, char *a_dest, const char *a_src,
                          size_t a_max_len) {

  // 1 added to account for null char
  size_t len = strlen(a_src) + 1;
  if (len == 1) {
    AUTHZ_LOG_ERROR("DataFed - '%s' value not set.\n", a_label);
    return true;
  }

  if (len > a_max_len) {
    AUTHZ_LOG_ERROR("DataFed - '%s' value too long (max %zu).\n", a_label,
                    a_max_len);
    return true;
  }

  strncpy(a_dest, a_src, a_max_len);

  return false;
}

/**
 * @brief Loads a key from a file into a destination buffer.
 *
 * This function attempts to open a file specified by `a_filename` and reads the
 * first line into the provided destination buffer (`a_dest`). It checks for
 * errors when opening the file and reading the key. If successful, the key is
 * stored in `a_dest` with any trailing carriage return or newline characters
 * stripped.
 *
 * @param a_dest A pointer to the buffer where the key will be loaded.
 * @param a_filename The name of the file from which the key is to be loaded.
 *
 * @return `true` if an error occurred (e.g., file couldn't be opened or read),
 * `false` otherwise.
 *
 * @note The function removes any trailing carriage return or newline characters
 * from the key string after it is read from the file. The destination buffer
 * (`a_dest`) is assumed to be large enough to hold the key (up to `MAX_KEY_LEN`
 * characters).
 */
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

// Assume write read lock is already in place
void initializeDefaults() {
  g_config.timeout = 10000;
  g_config.log_path[0] = '\0';
  g_config.repo_id[0] = '\0';
  g_config.server_addr[0] = '\0';
  g_config.user[0] = '\0';
  g_config.test_path[0] = '\0';
  g_config.globus_collection_path[0] = '\0';
  g_config.pub_key[0] = '\0';
  g_config.priv_key[0] = '\0';
  g_config.server_key[0] = '\0';
}

/**
 * @brief Opens a configuration file based on an environment variable or a
 * default path.
 *
 * This function first checks if the environment variable specified by `env_var`
 * is set. If the environment variable is set, its value is used as the path to
 * the configuration file. If the environment variable is not set, the function
 * falls back to using the `default_path` provided. It then attempts to open the
 * configuration file in read mode. If the file cannot be opened, an error is
 * logged.
 *
 * @param env_var The name of the environment variable that holds the path to
 * the configuration file.
 * @param default_path The default path to the configuration file to use if the
 * environment variable is not set.
 *
 * @return A pointer to the opened configuration file, or `NULL` if the file
 * could not be opened.
 *
 * @note The function logs information when it decides to use the default path
 * if the environment variable is not set, and logs an error if the file cannot
 * be opened.
 */
FILE *openConfigFile(const char *env_var, const char *default_path) {
  const char *config_path = getenv(env_var);
  if (!config_path) {
    config_path = default_path;
    AUTHZ_LOG_INFO("Environment variable %s not set. Using default path: %s",
                   env_var, default_path);
  } else {
    AUTHZ_LOG_INFO("Loading configuration file from: %s", config_path);
  }

  FILE *file = fopen(config_path, "r");
  if (!file) {
    AUTHZ_LOG_ERROR("Failed to open configuration file: %s", config_path);
  }
  return file;
}

/**
 * @brief Validates and parses a configuration line.
 *
 * This function processes a single line from a configuration file. It trims any
 * leading whitespace, skips empty lines or lines that are comments (starting
 * with `#`), and attempts to parse a valid key-value pair in the format
 * `key=value`. If the line contains a syntax error, an error message is logged
 * with the line number. The key and value are extracted into the provided `key`
 * and `value` buffers.
 *
 * @param line The configuration line to be validated and parsed.
 * @param line_number The line number in the configuration file (used for error
 * reporting).
 * @param key A pointer to a buffer where the parsed key will be stored.
 * @param value A pointer to a buffer where the parsed value will be stored.
 *
 * @return `true` if the line is valid or ignored (empty/comment line), `false`
 * if there is a syntax error.
 *
 * @note The function uses `sscanf` to extract the key and value, and it ensures
 * that the key is no longer than 255 characters and the value no longer than
 * 767 characters. If the line is valid, the `key` and `value` buffers will be
 * filled accordingly.
 */
bool validConfigLine(const char *line, int line_number, char *key,
                     char *value) {
  // Trim leading whitespace
  while (isspace(*line)) {
    line++;
  }

  // Skip empty lines or comments
  if (*line == '\0' || *line == '#') {
    return true; // Not an error; simply ignore
  }

  // Parse the line for key=value
  // %255[^=] → Reads up to 255 characters into key, stopping at =.
  // = Matches the literal = character in the input.
  // %767s Reads up to 767 non-whitespace characters into value.
  if (sscanf(line, "%255[^=]=%767s", key, value) != 2) {
    AUTHZ_LOG_ERROR("Syntax error in config file at line %d: %s", line_number,
                    line);
    return false;
  }

  return true;
}

/**
 * @brief Parses and processes a configuration line, setting the appropriate
 * values in the global config.
 *
 * This function validates and parses a single line from a configuration file.
 * It checks if the line is valid and contains a key-value pair, then assigns
 * the value to the corresponding field in the global `g_config` structure based
 * on the key. Supported keys include `repo_id`, `server_address`, `user`,
 * `log_path`, `test_path`, `globus_collection_path`, `pub_key`, `priv_key`,
 * `server_key`, and `timeout`. If the line is empty or a comment, it is
 * ignored. If an unknown key is encountered or there is an error processing a
 * key-value pair, an error message is logged.
 *
 * @param line The configuration line to be parsed.
 * @param line_number The line number in the configuration file, used for error
 * reporting.
 *
 * @return `false` if the line was parsed and processed successfully, `true` if
 * there was an error.
 *
 * @note This function utilizes the `validConfigLine` function to validate and
 * parse the configuration line. It uses `setConfigValInternal` to set values
 * for various configuration fields, and `loadKeyFile` for loading
 * public/private keys from files. If the configuration key is `timeout`, the
 * value is converted from a string to an integer using `atoi`. Any unrecognized
 * configuration keys will result in an error message.
 *
 * @note Assumes read write thread lock is in place.
 */
bool parseConfigLine(const char *line, int line_number) {
  char key[CONFIG_FILE_MAX_KEY_CHAR_SIZE];
  char value[CONFIG_FILE_MAX_VALUE_CHAR_SIZE];
  if (validConfigLine(line, line_number, key, value) == false) {
    return false;
  }

  bool err = false;
  if (strcmp(key, "repo_id") == 0) {
    err = setConfigValInternal("repo_id", g_config.repo_id, value, MAX_ID_LEN);
  } else if (strcmp(key, "server_address") == 0) {
    err = setConfigValInternal("server_address", g_config.server_addr, value,
                               MAX_ADDR_LEN);
  } else if (strcmp(key, "user") == 0) {
    err = setConfigValInternal("user", g_config.user, value, MAX_ID_LEN);
  } else if (strcmp(key, "log_path") == 0) {
    err = setConfigValInternal("log_path", g_config.log_path, value,
                               MAX_PATH_LEN);
    AUTHZ_LOG_INIT(g_config.log_path);
  } else if (strcmp(key, "test_path") == 0) {
    err = setConfigValInternal("test_path", g_config.test_path, value,
                               MAX_PATH_LEN);
  } else if (strcmp(key, "globus_collection_path") == 0) {
    err = setConfigValInternal("globus_collection_path",
                               g_config.globus_collection_path, value,
                               MAX_PATH_LEN);
  } else if (strcmp(key, "pub_key") == 0) {
    err = loadKeyFile(g_config.pub_key, value);
  } else if (strcmp(key, "priv_key") == 0) {
    err = loadKeyFile(g_config.priv_key, value);
  } else if (strcmp(key, "server_key") == 0) {
    err = loadKeyFile(g_config.server_key, value);
  } else if (strcmp(key, "timeout") == 0) {
    g_config.timeout = atoi(value);
  } else if (*line == '\0' || *line == '#') {
    // Ignore line
    return false;
  } else {
    AUTHZ_LOG_ERROR("Unknown configuration key: %s", key);
    return true;
  }

  if (err) {
    AUTHZ_LOG_ERROR("Error processing key: %s at line %d", key, line_number);
    return err;
  }

  return err;
}

/**
 * @brief Validates that all required configuration fields are set.
 *
 * This function checks if all the necessary fields in the global `g_config`
 * structure are populated. The required fields are `repo_id`, `server_addr`,
 * `user`, `pub_key`, `priv_key`, and `server_key`. If any of these fields are
 * missing (i.e., contain empty strings), an error message is logged listing the
 * missing keys. If all required fields are present, the function returns
 * `true`.
 *
 * @return `true` if all required configuration fields are present and valid,
 * `false` otherwise.
 *
 * @note The missing configuration keys, if any, are logged in an error message.
 * The check is performed by looking at the first character of each key in the
 * `g_config` structure, and if it is a null character (`\0`), the field is
 * considered missing.
 *
 * @note Assumes read write thread lock is in place.
 */
bool validateConfig() {
  char missing[CONFIG_FILE_MAX_LINE_LEN];
  missing[0] = '\0';

  if (g_config.repo_id[0] == '\0') {
    strcat(missing, " repo_id");
  }
  if (g_config.server_addr[0] == '\0') {
    strcat(missing, " server_address");
  }
  if (g_config.user[0] == '\0') {
    strcat(missing, " user");
  }
  if (g_config.pub_key[0] == '\0') {
    strcat(missing, " pub_key");
  }
  if (g_config.priv_key[0] == '\0') {
    strcat(missing, " priv_key");
  }
  if (g_config.server_key[0] == '\0') {
    strcat(missing, " server_key");
  }

  if (missing[0] != '\0') {
    AUTHZ_LOG_ERROR("Missing required configuration keys:%s", missing);
    return false;
  }

  return true;
}

/**
 * Will print the version information first go around..
 *
 * @note Assumes you have a thread lock in play
 **/
void logRelease() {
  if (first_run) {
    AUTHZ_LOG_INFO("DataFed Authz module started, version %s\n", getVersion());
    AUTHZ_LOG_INFO("                         API, version %s\n",
                   getAPIVersion());
    AUTHZ_LOG_INFO("                     Release, version %s\n",
                   getReleaseVersion());
    first_run = false;
  }
}

/******************************************************************************
 * Public Facing Functions
 ******************************************************************************/

void allowConfigReinitialization() {
  pthread_rwlock_wrlock(&config_rwlock);
  config_loaded = false;
  pthread_rwlock_unlock(&config_rwlock);
}

struct Config createLocalConfigCopy() {
  pthread_rwlock_rdlock(&config_rwlock);
  struct Config temp = g_config;
  pthread_rwlock_unlock(&config_rwlock);
  return temp;
}

// Function to safely get a configuration value
bool getConfigVal(const char *a_label, char *a_dest, size_t a_max_len) {

  // Acquire a read lock (allow concurrent reads)
  pthread_rwlock_rdlock(&config_rwlock);

  bool err = false;
  // Logic to get specific configuration value
  if (strcmp(a_label, "repo_id") == 0) {
    strncpy(a_dest, g_config.repo_id, a_max_len);
  } else if (strcmp(a_label, "server_addr") == 0) {
    strncpy(a_dest, g_config.server_addr, a_max_len);
  } else if (strcmp(a_label, "pub_key") == 0) {
    strncpy(a_dest, g_config.pub_key, a_max_len);
  } else if (strcmp(a_label, "priv_key") == 0) {
    strncpy(a_dest, g_config.priv_key, a_max_len);
  } else if (strcmp(a_label, "server_key") == 0) {
    strncpy(a_dest, g_config.server_key, a_max_len);
  } else if (strcmp(a_label, "user") == 0) {
    strncpy(a_dest, g_config.user, a_max_len);
  } else if (strcmp(a_label, "test_path") == 0) {
    strncpy(a_dest, g_config.test_path, a_max_len);
  } else if (strcmp(a_label, "log_path") == 0) {
    strncpy(a_dest, g_config.log_path, a_max_len);
  } else if (strcmp(a_label, "globus_collection_path") == 0) {
    strncpy(a_dest, g_config.globus_collection_path, a_max_len);
  } else {
    err = true;
    // Make it clear nothing was found
    a_dest[0] = '\0';
  }

  // Release the read lock
  pthread_rwlock_unlock(&config_rwlock);
  return err;
}

// Function to safely set a configuration value
bool setConfigVal(const char *a_label, const char *a_src) {

  // Acquire a write lock (only one writer, no concurrent readers)
  pthread_rwlock_wrlock(&config_rwlock);

  bool err = false;
  // Logic to set specific configuration value
  if (strcmp(a_label, "repo_id") == 0) {
    err = setConfigValInternal(a_label, g_config.repo_id, a_src, MAX_ID_LEN);
  } else if (strcmp(a_label, "server_addr") == 0) {
    err = setConfigValInternal(a_label, g_config.server_addr, a_src,
                               MAX_ADDR_LEN);
  } else if (strcmp(a_label, "pub_key") == 0) {
    err = setConfigValInternal(a_label, g_config.pub_key, a_src, MAX_KEY_LEN);
  } else if (strcmp(a_label, "priv_key") == 0) {
    err = setConfigValInternal(a_label, g_config.priv_key, a_src, MAX_KEY_LEN);
  } else if (strcmp(a_label, "server_key") == 0) {
    err =
        setConfigValInternal(a_label, g_config.server_key, a_src, MAX_KEY_LEN);
  } else if (strcmp(a_label, "user") == 0) {
    err = setConfigValInternal(a_label, g_config.user, a_src, MAX_ID_LEN);
  } else if (strcmp(a_label, "test_path") == 0) {
    err =
        setConfigValInternal(a_label, g_config.test_path, a_src, MAX_PATH_LEN);
  } else if (strcmp(a_label, "log_path") == 0) {
    err = setConfigValInternal(a_label, g_config.log_path, a_src, MAX_PATH_LEN);
  } else if (strcmp(a_label, "globus_collection_path") == 0) {
    err = setConfigValInternal(a_label, g_config.globus_collection_path, a_src,
                               MAX_PATH_LEN);
  } else {
    err = true;
  }

  // Release the write lock
  pthread_rwlock_unlock(&config_rwlock);
  return err;
}

bool parseConfigFile(FILE *config_file) {
  char line[CONFIG_FILE_MAX_LINE_LEN];
  line[0] = '\0';
  int line_number = 0;
  bool parse_success = true;
  while (fgets(line, sizeof(line), config_file)) {
    line_number++;
    line[strcspn(line, "\r\n")] = '\0'; // Remove newlines
    if (strlen(line) == 0 || line[0] == '#')
      continue; // Skip comments/empty lines

    if (parseConfigLine(line, line_number)) {
      AUTHZ_LOG_ERROR("Configuration file parsing failed line: %s.", line);
      parse_success = false;
      break;
    }
  }
  return parse_success;
}

bool initializeGlobalConfig() {
  bool error_found = true;
  // Acquire a write lock to modify configuration values
  pthread_rwlock_wrlock(&config_rwlock);

  // Initialized only at start
  if (config_loaded) {
    AUTHZ_LOG_INFO("Config file already loaded. Skipping reload.\n");
    error_found = false;
    logRelease();
  } else {

    // Moving default initialization outside of the while loop prevents
    // overwriting
    initializeDefaults();

    FILE *config_file = openConfigFile("DATAFED_AUTHZ_CFG_FILE",
                                       "/opt/datafed/authz/datafed-authz.cfg");
    if (config_file) {

      bool parse_success = parseConfigFile(config_file);

      fclose(config_file);

      if (parse_success && validateConfig()) {
        AUTHZ_LOG_INFO("Configuration loaded successfully.");
        error_found = false;
      } else {
        AUTHZ_LOG_ERROR("Configuration validation failed.");
      }

      // Avoid trying to reload
      config_loaded = true;
    }
    logRelease();
  }
  pthread_rwlock_unlock(&config_rwlock);
  return error_found;
}
