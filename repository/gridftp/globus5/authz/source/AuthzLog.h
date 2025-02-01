
#ifndef AUTHZ_LOG_H
#define AUTHZ_LOG_H

// Private includes
#include "AuthzWorker.h"

// Standard includes
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

// Define LOG_LEVEL and USE_SYSLOG
#define LOG_LEVEL 1

#ifndef DONT_USE_SYSLOG
#define DONT_USE_SYSLOG
#endif

// Define logging macros
#if defined(DONT_USE_SYSLOG)
extern FILE *log_file;
extern bool write_to_file;
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

#endif // AUTHZ_LOG_H
