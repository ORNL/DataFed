#ifndef LOG_HPP
#define LOG_HPP
#pragma once

// Third party includes
#include <syslog.h>
#include <boost/date_time/posix_time/posix_time.hpp>

// Standard includes
#include <functional>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

// Have to use macros for the line and func macros to work
#define DL_LOG(level, content) \
  ::SDMS::global_logger.log(level, content, __FILE__,  __func__, __LINE__ );
#define DL_LOG_CRITICAL(content) \
  ::SDMS::global_logger.critical(content, __FILE__, __func__, __LINE__ );
#define DL_LOG_ERROR(content) \
  ::SDMS::global_logger.error(content, __FILE__, __func__, __LINE__);
#define DL_LOG_WARNING(content) \
  ::SDMS::global_logger.warning(content, __FILE__, __func__, __LINE__ );
#define DL_LOG_INFO(content) \
  ::SDMS::global_logger.info(content, __FILE__, __func__, __LINE__);
#define DL_LOG_DEBUG(content) \
  ::SDMS::global_logger.debug(content, __FILE__, __func__, __LINE__);
#define DL_LOG_TRACE(content) \
  ::SDMS::global_logger.trace(content, __FILE__, __func__, __LINE__ );


namespace SDMS {

  enum class LogLevel {
    CRITICAL,
    ERROR,
    WARNING,
    INFO,
    DEBUG,
    TRACE
  };


  std::string toString(const LogLevel level);
  int toSysLog(const LogLevel level);

  class LogLineContent {
    public:
      std::string message = "";
      std::string thread_name = "";
      std::string correlation_id = "";
      int thread_id = 0;

  };
  std::ostream & operator << (std::ostream &out, const LogLineContent &params);

  class Logger {
    private:

      // Parameters
      std::vector<std::reference_wrapper<std::ostream>> m_streams;
      LogLevel m_log_level = LogLevel::INFO;
      bool m_output_to_syslog = false;
      std::stringstream m_buffer;
      mutable std::vector<std::unique_ptr<std::mutex>> m_mutexes;

      // Functions
      void output(const LogLevel, const LogLineContent & log_params, std::string, std::string, int);
    public:
      void setLevel(LogLevel) noexcept;
      void addStream(std::ostream & stream);

      void log(const LogLevel, const LogLineContent &, std::string, std::string, int);
      void critical(const LogLineContent &, std::string, std::string, int);
      void error(const LogLineContent &, std::string, std::string, int);
      void warning(const LogLineContent &, std::string, std::string, int);
      void info(const LogLineContent &, std::string, std::string, int);
      void debug(const LogLineContent &, std::string, std::string, int);
      void trace(const LogLineContent &, std::string, std::string, int);

  };
  extern Logger global_logger;

  std::ostream & operator << (std::ostream &out, const LogLineContent &params); 
/*  struct LogSettings {
    LogLevel log_level = LogLevel::INFO;
    bool output_to_cerr = true;
    bool output_to_syslog = false;
    std::ostream & output_stream = std::cerr;
  };
  extern LogSettings global_log_settings;*/

} // namespace SDMS 

#endif // LOG_HPP
