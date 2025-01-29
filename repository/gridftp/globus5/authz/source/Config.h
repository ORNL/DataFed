#ifndef CONFIG_H
#define CONFIG_H

#define MAX_ADDR_LEN 200
#define MAX_ID_LEN 80
#define MAX_PATH_LEN 500
#define MAX_KEY_LEN 100

// Standard includes
#include <stdbool.h>
#include <stddef.h>

struct Config {
  char repo_id[MAX_ID_LEN];
  char server_addr[MAX_ADDR_LEN];
  char pub_key[MAX_KEY_LEN];
  char priv_key[MAX_KEY_LEN];
  char server_key[MAX_KEY_LEN];
  char user[MAX_ID_LEN];
  char test_path[MAX_PATH_LEN];
  char log_path[MAX_PATH_LEN];
  char globus_collection_path[MAX_PATH_LEN];
  size_t timeout;
};

/**
 * @brief Initializes the global configuration by loading settings from a
 * configuration file.
 *
 * This function acquires a write lock to safely initialize the global
 * configuration. It first checks if the configuration has already been loaded,
 * skipping the reload if it has. If not, it proceeds to load default values and
 * then attempts to load values from the configuration file. The function
 * validates the configuration after loading the file and logs the results.
 *
 * @return `false` if the configuration was successfully loaded and validated,
 * or `true` if an error occurred (e.g., file read failure, parsing error,
 * validation failure).
 *
 * @note The function uses a write lock (`config_rwlock`) to ensure exclusive
 * access to the global configuration during the initialization process. It
 * ensures that the configuration is only loaded once, even if multiple threads
 * attempt to initialize it.
 *
 * @note The DATAFED_AUTHZ_CFG_FILE env variable must be set in the gridFTP
 * service script (usually /etc/init.d/globus-gridftp-server). This variable
 * points to the configuration file used for DataFed communcation settings
 */
bool initializeGlobalConfig();

/**
 * @brief Allows reinitialization of the global configuration by resetting the
 * `config_loaded` flag.
 *
 * This function acquires a write lock to ensure exclusive access to the global
 * configuration state. It resets the `config_loaded` flag to `false`, which
 * indicates that the configuration can be reloaded. After resetting the flag,
 * the write lock is released. This function is useful when you need to reload
 * the configuration after it has already been loaded once.
 *
 * @note The function uses a write lock (`config_rwlock`) to ensure exclusive
 * access to the global configuration while modifying the `config_loaded` flag.
 * This prevents any readers or writers from accessing the configuration while
 * it is being updated.
 */
void allowConfigReinitialization();

/**
 * @brief Retrieves a configuration value based on the provided label.
 *
 * This function acquires a read lock to safely access the global configuration
 * and retrieve the value associated with the specified label. If the label
 * matches one of the known configuration keys (e.g., `repo_id`, `server_addr`,
 * `user`, etc.), the corresponding value is copied into the `a_dest` buffer,
 * ensuring that it does not exceed the provided maximum length (`a_max_len`).
 * The lock is then released after the operation.
 *
 * @param a_label The configuration key (label) for which the value is
 * requested.
 * @param a_dest A buffer where the configuration value will be copied.
 * @param a_max_len The maximum length of the buffer `a_dest`.
 *
 * @return `true` if the configuration value was successfully retrieved, or
 * `false` if the label does not match any known configuration keys.
 *
 * @note The function uses a read-write lock (`config_rwlock`) to ensure
 * thread-safety when reading the global configuration. If the requested label
 * does not match any known keys, the destination buffer is cleared and `true`
 * is returned to indicate no value was found.
 */
bool getConfigVal(const char *a_label, char *a_dest, size_t a_max_len);

/**
 * @brief Sets a configuration value based on the provided label.
 *
 * This function acquires a write lock to safely modify the global
 * configuration. It checks the provided label against known configuration keys
 * and updates the corresponding value if a match is found. The new value is
 * copied from the `a_src` argument into the appropriate configuration field,
 * ensuring that the length does not exceed the maximum size for that field.
 *
 * @param a_label The configuration key (label) for which the value is being
 * set.
 * @param a_src The new value to set for the specified configuration key.
 *
 * @return `true` if the configuration value was successfully set, or `false` if
 * the label does not match any known configuration keys or an error occurred
 * during the process.
 *
 * @note The function uses a write lock (`config_rwlock`) to ensure exclusive
 * access to the global configuration while the update is being made. Only one
 * writer can modify the configuration at a time, and no readers are allowed
 * during this operation.
 */
bool setConfigVal(const char *a_label, const char *a_src);

/**
 * @brief Creates a local copy of the global configuration.
 *
 * This function acquires a read lock to safely access the global `g_config`
 * structure, copies its contents into a temporary `Config` structure, and then
 * releases the lock. The local copy of the configuration is returned to the
 * caller. This ensures thread-safety when accessing the global configuration.
 *
 * @return A copy of the current global configuration stored in a `Config`
 * structure.
 *
 * @note The function uses a read-write lock (`config_rwlock`) to ensure that
 * the global configuration is not modified while it is being copied.
 */
struct Config createLocalConfigCopy();

#endif
