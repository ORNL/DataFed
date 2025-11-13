#ifndef DYNA_LOG_HPP
#define DYNA_LOG_HPP
#pragma once

// Third party includes
#include <boost/date_time/posix_time/posix_time.hpp>
#include <syslog.h>

// Standard includes
#include <functional>
#include <iostream>
#include <list>
#include <memory>
#include <mutex>
#include <string>

// Have to use macros for the line and func macros to work
#define DL_LOG(level, context, message)                                        \
  {                                                                            \
    std::stringstream temp_buffer;                                             \
    temp_buffer << message;                                                    \
    ::SDMS::global_logger.log(level, __FILE__, __func__, __LINE__, context,    \
                              temp_buffer.str());                              \
  }

#define DL_CRITICAL(context, message)                                          \
  {                                                                            \
    std::stringstream temp_buffer;                                             \
    temp_buffer << message;                                                    \
    ::SDMS::global_logger.critical(__FILE__, __func__, __LINE__, context,      \
                                   temp_buffer.str());                         \
  }

#define DL_ERROR(context, message)                                             \
  {                                                                            \
    std::stringstream temp_buffer;                                             \
    temp_buffer << message;                                                    \
    ::SDMS::global_logger.error(__FILE__, __func__, __LINE__, context,         \
                                temp_buffer.str());                            \
  }

#define DL_WARNING(context, message)                                           \
  {                                                                            \
    std::stringstream temp_buffer;                                             \
    temp_buffer << message;                                                    \
    ::SDMS::global_logger.warning(__FILE__, __func__, __LINE__, context,       \
                                  temp_buffer.str());                          \
  }

#define DL_INFO(context, message)                                              \
  {                                                                            \
    std::stringstream temp_buffer;                                             \
    temp_buffer << message;                                                    \
    ::SDMS::global_logger.info(__FILE__, __func__, __LINE__, context,          \
                               temp_buffer.str());                             \
  }

#define DL_DEBUG(context, message)                                             \
  {                                                                            \
    std::stringstream temp_buffer;                                             \
    temp_buffer << message;                                                    \
    ::SDMS::global_logger.debug(__FILE__, __func__, __LINE__, context,         \
                                temp_buffer.str());                            \
  }

#define DL_TRACE(context, message)                                             \
  {                                                                            \
    std::stringstream temp_buffer;                                             \
    temp_buffer << message;                                                    \
    ::SDMS::global_logger.trace(__FILE__, __func__, __LINE__, context,         \
                                temp_buffer.str());                            \
  }

namespace SDMS {

/**
 * Here unsigned int is used so that we can compare the numeric values when
 * choosing whether to print a log message.
 *
 * CRITICAL = 0
 * ERROR    = 1
 * WARNING  = 2
 * INFO     = 3
 * DEBUG    = 4
 * TRACE    = 5
 **/
enum class LogLevel : unsigned int {
  CRITICAL,
  ERROR,
  WARNING,
  INFO,
  DEBUG,
  TRACE,

  LAST_SENTINEL // Used to check that unsigned int conversions fall in valid
                // range E.g.
                // value < static_cast<unsigned int>(LogLevel::LAST_SENTINEL)
};

std::string toString(const LogLevel level);
int toSysLog(const LogLevel level);

class LogContext {
public:
  std::string thread_name = "";
  std::string correlation_id = "";
  int thread_id = 0;
};

class LogLine {
public:
  LogLine(LogContext ctx, std::string msg) : context(ctx), message(msg){};
  LogContext context;
  std::string message = "";
};
std::ostream &operator<<(std::ostream &out, const LogLine &log_line);

class Logger {
public:
  // Define the structure for each element of list used to track
  // streams.
  struct StreamEntry {
    std::reference_wrapper<std::ostream>
        stream;                        // Reference wrapper for the stream
    uint32_t id;                       // id for the stream
    std::unique_ptr<std::mutex> mutex; // Mutex for thread-safe operations

    StreamEntry(std::ostream &out_stream, uint32_t a_id)
        : stream(out_stream), id(a_id), mutex(std::make_unique<std::mutex>()) {}
  };
private:
  // List was chosen because we will need to be adding and removing streams that
  // are at different points in the list this does not work well in a
  // vector datastructure.
  mutable std::list<StreamEntry> m_streams; // List to hold stream entries
  mutable std::mutex m_streams_mutex;       // Mutex to protect the list 
  static uint32_t m_stream_id;              // Used to create an id for the stream

  // Parameters
  LogLevel m_log_level = LogLevel::INFO;
  bool m_output_to_syslog = false;

  // Internal Methods
  void output(const LogLevel, std::string, std::string, int,
              const LogContext &context, const std::string &message);

public:
  // Methods
  void setLevel(LogLevel) noexcept;
 
  /**
   * Add a new stream and return an identifier to it for easy removal
   * in the future.
   *
   * @note care should be taken when adding streams because they are
   * are stored as references, if the object goes out of scope the
   * stored reference becomes invalid. removeStream should be called
   * befor a stream goes out of scope.
   **/
  uint32_t addStream(std::ostream &stream);

  // Remove a stream by id, this is fast for a linked list.
  void removeStream(const uint32_t stream_id);

  void setSysLog(bool on_or_off) noexcept { m_output_to_syslog = on_or_off; }

  void log(const LogLevel, std::string file_name, std::string func_name, int,
           const LogContext &context, const std::string &message);
  void critical(std::string file_name, std::string func_name, int,
                const LogContext &context, const std::string &message);
  void error(std::string file_name, std::string func_name, int,
             const LogContext &context, const std::string &message);
  void warning(std::string file_name, std::string func_name, int,
               const LogContext &context, const std::string &message);
  void info(std::string file_name, std::string func_name, int,
            const LogContext &context, const std::string &message);
  void debug(std::string file_name, std::string func_name, int,
             const LogContext &context, const std::string &message);
  void trace(std::string file_name, std::string func_name, int,
             const LogContext &context, const std::string &message);
};

// Thread safe global logger
extern Logger global_logger;

} // namespace SDMS

#endif // DYNA_LOG_HPP
