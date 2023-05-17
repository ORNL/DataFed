
// Local public includes
#include "common/DynaLog.hpp"

// Standard includes
#include <optional>
#include <string>

namespace SDMS {

  Logger global_logger;

  std::string toString(const LogLevel level) {
    if( level == LogLevel::TRACE ) {
      return "TRACE"; 
    } else if( level == LogLevel::DEBUG ) {
      return "DEBUG"; 
    } else if( level == LogLevel::INFO ) {
      return "INFO"; 
    } else if( level == LogLevel::WARNING ) {
      return "WARN"; 
    } else if( level == LogLevel::ERROR ) {
      return "ERROR"; 
    }  
    return "CRIT"; 
  }

  int toSysLog(const LogLevel level) {
    if( level == LogLevel::TRACE ) {
      return LOG_DEBUG + 1;
    } else if( level == LogLevel::DEBUG ) {
      return LOG_DEBUG;
    } else if( level == LogLevel::INFO ) {
      return LOG_INFO;
    } else if( level == LogLevel::WARNING ) {
      return LOG_WARNING;
    } else if( level == LogLevel::ERROR ) {
      return LOG_ERR;
    } 
    return LOG_EMERG;
  }

  std::ostream & operator << (std::ostream &out, const LogLineContent &log_line) {
    out << "{ ";
      bool insert_comma = false;
    if( not log_line.thread_name.empty() ) {
      out << "\"thread_name\": ";
      out << "\"" << log_line.thread_name << "\"";
      insert_comma = true;
    }
    if( log_line.thread_id ) {
      if( insert_comma ) {
        out << ", ";
      }
      out << "\"thread_id\": ";
      out << "\"" << log_line.thread_id << "\"";
      insert_comma = true;
    }
    if( not log_line.correlation_id.empty() ) {
      if( insert_comma ) {
        out << ", ";
      }
      out << "\"correlation_id\": ";
      out << "\"" << log_line.correlation_id << "\"";
      insert_comma = true;
    }
    if( not log_line.message.empty() ) {
      if( insert_comma ) {
        out << ", ";
      }
      out << "\"message\": ";
      out << "\"" << log_line.message << "\"";
    }
    out << " }";
    return out;
  }

  void Logger::output(const LogLevel level, const LogLineContent & log_line, std::string file, std::string func, int line_num) {

      size_t index = 0;
      for( auto & output_stream : m_streams ) {
        std::lock_guard<std::mutex> lock(*m_mutexes.at(index));
        index++;
        boost::posix_time::ptime time = boost::posix_time::microsec_clock::universal_time();
        output_stream.get() << boost::posix_time::to_iso_extended_string(time) << "Z ";
        output_stream.get() << toString(level) << " ";
        output_stream.get() << file << ":" << func << ":" << line_num << " ";
        output_stream.get() << log_line; 
        output_stream.get() << std::endl;
      }

      if ( m_output_to_syslog ) {
          m_buffer << file << ":" << func << ":" << line_num << " ";
          m_buffer << log_line;
          m_buffer << std::endl;
          syslog(toSysLog(level),"%s",m_buffer.str().c_str());
          m_buffer.str("");
      } 
  }

  void Logger::setLevel(LogLevel level) noexcept { 
    m_log_level = level;
  }

  void Logger::addStream(std::ostream & stream) {
    m_streams.push_back(std::ref(stream));
    m_mutexes.emplace_back(std::make_unique<std::mutex>());
  }

  void Logger::trace(const LogLineContent & content, std::string file, std::string func, int line_num) { 
    if( m_log_level >= LogLevel::TRACE ) {
      output(LogLevel::TRACE, content, file, func, line_num);    
    }
  }
  void Logger::debug(const LogLineContent & content, std::string file, std::string func, int line_num) { 
    if( m_log_level >= LogLevel::DEBUG ) {
      output(LogLevel::DEBUG, content, file, func, line_num);    
    }
  }
  void Logger::info(const LogLineContent & content, std::string file, std::string func, int line_num) { 
    if( m_log_level >= LogLevel::INFO ) {
      output(LogLevel::INFO, content, file, func, line_num);    
    }
  }
  void Logger::warning(const LogLineContent & content, std::string file, std::string func, int line_num) { 
    if( m_log_level >= LogLevel::WARNING ) {
      output(LogLevel::WARNING, content, file, func, line_num);    
    }
  }
  void Logger::error(const LogLineContent & content, std::string file, std::string func, int line_num) { 
    if( m_log_level >= LogLevel::ERROR ) {
      output(LogLevel::ERROR, content, file, func, line_num);    
    }
  }
  void Logger::critical(const LogLineContent & content, std::string file, std::string func, int line_num) { 
    if( m_log_level >= LogLevel::CRITICAL ) {
      output(LogLevel::CRITICAL, content, file, func, line_num);    
    }
  }

  void Logger::log(LogLevel level, const LogLineContent & content, std::string file, std::string func, int line_num) {
    if( level == LogLevel::TRACE ) {
      trace(content, file, func, line_num);
    } else if( level == LogLevel::DEBUG ) {
      debug(content, file, func, line_num);
    } else if( level == LogLevel::INFO ) {
      info(content, file, func, line_num);
    } else if( level == LogLevel::WARNING ) {
      warning(content, file, func, line_num);
    } else if( level == LogLevel::ERROR ) {
      error(content, file, func, line_num);
    } else if( level == LogLevel::CRITICAL ) {
      critical(content, file, func, line_num);
    }
  }
/*  constexpr void output(const char * level, const LogLineContent & log_line) {
      if ( global_log_settings.output_to_cerr ) {
        boost::posix_time::ptime time = boost::posix_time::microsec_clock::universal_time();
        std::cerr << boost::posix_time::to_iso_extended_string(t) << "Z\n";
        std::cerr << std::put_time(&local_time, "%d-%m-%y %H-%M-%S ");
        std::cerr << level << " ";
        std::cerr << __FILE__ << ":" << __LINE__ << " ";
        std::cerr << log_line; 
        std::cerr << std::endl;
      }

      if ( global_log_settings.output_to_syslog ) {
          global_log_buffer.buffer << __FILE__ << ":" << __LINE__ << " ";
          global_log_buffer.buffer << log_line;
          global_log_buffer.buffer << std::endl;
          syslog(toSysLog(level),"%s",global_log_buffer.buffer.str().c_str());
          global_log_buffer.buffer.str("");
      } 
  }*/

} // namespace SDMS 

