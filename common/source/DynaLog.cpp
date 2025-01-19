
// Local public includes
#include "common/DynaLog.hpp"

// Standard includes
#include <optional>
#include <string>

namespace SDMS {

Logger global_logger;

std::string toString(const LogLevel level) {
  if (level == LogLevel::TRACE) {
    return "TRACE";
  } else if (level == LogLevel::DEBUG) {
    return "DEBUG";
  } else if (level == LogLevel::INFO) {
    return "INFO";
  } else if (level == LogLevel::WARNING) {
    return "WARN";
  } else if (level == LogLevel::ERROR) {
    return "ERROR";
  }
  return "CRIT";
}

int toSysLog(const LogLevel level) {
  if (level == LogLevel::TRACE) {
    return LOG_DEBUG + 1;
  } else if (level == LogLevel::DEBUG) {
    return LOG_DEBUG;
  } else if (level == LogLevel::INFO) {
    return LOG_INFO;
  } else if (level == LogLevel::WARNING) {
    return LOG_WARNING;
  } else if (level == LogLevel::ERROR) {
    return LOG_ERR;
  }
  return LOG_EMERG;
}

std::ostream &operator<<(std::ostream &out, const LogLine &log_line) {
  out << "{ ";
  bool insert_comma = false;
  if (not log_line.context.thread_name.empty()) {
    out << "\"thread_name\": ";
    out << "\"" << log_line.context.thread_name << "\"";
    insert_comma = true;
  }
  if (log_line.context.thread_id) {
    if (insert_comma) {
      out << ", ";
    }
    out << "\"thread_id\": ";
    out << "\"" << log_line.context.thread_id << "\"";
    insert_comma = true;
  }
  if (not log_line.context.correlation_id.empty()) {
    if (insert_comma) {
      out << ", ";
    }
    out << "\"correlation_id\": ";
    out << "\"" << log_line.context.correlation_id << "\"";
    insert_comma = true;
  }
  if (not log_line.message.empty()) {
    if (insert_comma) {
      out << ", ";
    }
    out << "\"message\": ";
    out << "\"" << log_line.message << "\"";
  }
  out << " }";
  return out;
}




void Logger::output(const LogLevel level, std::string file, std::string func,
                    int line_num, const LogContext &context,
                    const std::string &message) {

    std::lock_guard<std::mutex> lock(m_streams_mutex);  // Lock the list mutex

    for (auto &output_stream : m_streams) {
        std::lock_guard<std::mutex> stream_lock(*output_stream.mutex);  // Lock individual stream mutex
        boost::posix_time::ptime time =
            boost::posix_time::microsec_clock::universal_time();
        output_stream.stream.get() << boost::posix_time::to_iso_extended_string(time)
                                   << "Z ";
        output_stream.stream.get() << toString(level) << " ";
        output_stream.stream.get() << file << ":" << func << ":" << line_num << " ";
        LogLine log_line(context, message);
        output_stream.stream.get() << log_line;
        output_stream.stream.get() << std::endl;
    }

    if (m_output_to_syslog) {
        std::stringstream buffer;
        buffer << message;
        buffer << file << ":" << func << ":" << line_num << " ";
        LogLine log_line(context, message);
        buffer << log_line;
        buffer << std::endl;
        syslog(toSysLog(level), "%s", buffer.str().c_str());
    }
}

void Logger::setLevel(LogLevel level) noexcept { m_log_level = level; }

std::list<Logger::StreamEntry>::iterator Logger::addStream(std::ostream &stream) {
    std::lock_guard<std::mutex> lock(m_streams_mutex);  // Lock the list mutex
    auto it = m_streams.insert(m_streams.end(), StreamEntry{stream});  // Insert and get iterator
    return it;  // Return the iterator pointing to the new stream element
}

void Logger::removeStream(std::list<StreamEntry>::iterator it) {
    std::lock_guard<std::mutex> lock(m_streams_mutex);  // Lock the list mutex
    if (it != m_streams.end()) {
        m_streams.erase(it);
    }
}
//void Logger::addStream(std::ostream &stream) {
//  m_streams.push_back(std::ref(stream));
//  m_mutexes.emplace_back(std::make_unique<std::mutex>());
//}

void Logger::trace(std::string file, std::string func, int line_num,
                   const LogContext &context, const std::string &message) {
  if (static_cast<unsigned int>(m_log_level) >=
      static_cast<unsigned int>(LogLevel::TRACE)) {
    output(LogLevel::TRACE, file, func, line_num, context, message);
  }
}
void Logger::debug(std::string file, std::string func, int line_num,
                   const LogContext &context, const std::string &message) {
  if (static_cast<unsigned int>(m_log_level) >=
      static_cast<unsigned int>(LogLevel::DEBUG)) {
    output(LogLevel::DEBUG, file, func, line_num, context, message);
  }
}
void Logger::info(std::string file, std::string func, int line_num,
                  const LogContext &context, const std::string &message) {
  if (static_cast<unsigned int>(m_log_level) >=
      static_cast<unsigned int>(LogLevel::INFO)) {
    output(LogLevel::INFO, file, func, line_num, context, message);
  }
}
void Logger::warning(std::string file, std::string func, int line_num,
                     const LogContext &context, const std::string &message) {
  if (static_cast<unsigned int>(m_log_level) >=
      static_cast<unsigned int>(LogLevel::WARNING)) {
    output(LogLevel::WARNING, file, func, line_num, context, message);
  }
}
void Logger::error(std::string file, std::string func, int line_num,
                   const LogContext &context, const std::string &message) {
  if (static_cast<unsigned int>(m_log_level) >=
      static_cast<unsigned int>(LogLevel::ERROR)) {
    output(LogLevel::ERROR, file, func, line_num, context, message);
  }
}
void Logger::critical(std::string file, std::string func, int line_num,
                      const LogContext &context, const std::string &message) {
  if (static_cast<unsigned int>(m_log_level) >=
      static_cast<unsigned int>(LogLevel::CRITICAL)) {
    output(LogLevel::CRITICAL, file, func, line_num, context, message);
  }
}

void Logger::log(LogLevel level, std::string file, std::string func,
                 int line_num, const LogContext &context,
                 const std::string &message) {
  if (level == LogLevel::TRACE) {
    trace(file, func, line_num, context, message);
  } else if (level == LogLevel::DEBUG) {
    debug(file, func, line_num, context, message);
  } else if (level == LogLevel::INFO) {
    info(file, func, line_num, context, message);
  } else if (level == LogLevel::WARNING) {
    warning(file, func, line_num, context, message);
  } else if (level == LogLevel::ERROR) {
    error(file, func, line_num, context, message);
  } else if (level == LogLevel::CRITICAL) {
    critical(file, func, line_num, context, message);
  }
}

} // namespace SDMS
