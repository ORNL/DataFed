#ifndef DYNADL_HPP
#define DYNADL_HPP
#pragma once

#ifdef USE_DYNALOG

// Trace lines are disabled by default to avoid overhead, define DL_IMPL_TRACE
// to enable
//#define DL_IMPL_TRACE

#include <ctime>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <syslog.h>

namespace DynaLog {

enum Level {
  DL_EMERG_LEV = LOG_EMERG,
  DL_ERROR_LEV = LOG_ERR,
  DL_WARN_LEV = LOG_WARNING,
  DL_INFO_LEV = LOG_INFO,
  DL_DEBUG_LEV = LOG_DEBUG,
  DL_TRACE_LEV = LOG_DEBUG + 1  // syslog doesn't support trace-level
};

#ifdef DEF_DYNALOG

bool g_enabled = true;
int g_level = DL_INFO_LEV;
bool g_use_cerr = true;
bool g_use_syslog = false;
std::stringstream g_stream_buf;

#else

extern bool g_enabled;
extern int g_level;
extern bool g_use_cerr;
extern bool g_use_syslog;
extern std::stringstream g_stream_buf;

#endif

#define OUTPUT(lev, x)                                                   \
  {                                                                      \
    std::time_t g_time = std::time(nullptr);                             \
    std::tm local_time = *std::localtime(&g_time);                       \
    if (DynaLog::g_use_cerr) {                                           \
      std::cerr << std::put_time(&local_time, "%d-%m-%y %H-%M-%S ")      \
                << __FILE__ << ":" << __LINE__ << " " << x << std::endl; \
    }                                                                    \
    if (DynaLog::g_use_syslog) {                                         \
      DynaLog::g_stream_buf << __FILE__ << ":" << __LINE__ << " " << x   \
                            << std::endl;                                \
      syslog(lev, "%s", DynaLog::g_stream_buf.str().c_str());            \
      DynaLog::g_stream_buf.str("");                                     \
    }                                                                    \
  }

#define OUTPUT_TRACE(x)          \
  if (DynaLog::g_use_cerr) {     \
    std::cerr << x << std::endl; \
  }

#define DL_SET_ENABLED(x) \
  { DynaLog::g_enabled = x; }
#define DL_SET_LEVEL(x) \
  { DynaLog::g_level = x; }
#define DL_SET_CERR_ENABLED(x) \
  { DynaLog::g_use_cerr = x; }
#define DL_SET_SYSDL_ENABLED(x) \
  { DynaLog::g_use_syslog = x; }

#define DL_EMERG(x)                  \
  if (DynaLog::g_enabled) {          \
    OUTPUT(DynaLog::DL_EMERG_LEV, x) \
  }
#define DL_ERROR(x)                                                      \
  if (DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_ERROR_LEV) { \
    OUTPUT(DynaLog::DL_ERROR_LEV, x)                                     \
  }
#define DL_WARN(x)                                                      \
  if (DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_WARN_LEV) { \
    OUTPUT(DynaLog::DL_WARN_LEV, x)                                     \
  }
#define DL_INFO(x)                                                      \
  if (DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_INFO_LEV) { \
    OUTPUT(DynaLog::DL_INFO_LEV, x)                                     \
  }
#define DL_DEBUG(x)                                                      \
  if (DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_DEBUG_LEV) { \
    OUTPUT(DynaLog::DL_DEBUG_LEV, x)                                     \
  }
#ifdef DL_IMPL_TRACE
#define DL_TRACE(x)                                                      \
  if (DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_TRACE_LEV) { \
    OUTPUT_TRACE(x)                                                      \
  }
#else
#define DL_TRACE(x)
#endif

}  // namespace DynaLog

#else  // Use_DYNALOG

#define DL_SET_ENABLED(x)
#define DL_SET_LEVEL(x)
#define DL_SET_CERR_ENABLED(x)
#define DL_SET_SYSDL_ENABLED(x)
#define DL_EMERG(x)
#define DL_ERROR(x)
#define DL_WARN(x)
#define DL_INFO(x)
#define DL_DEBUG(x)
#define DL_TRACE(x)

#endif  // USE_DYNALOG
#endif  // DYNADL_HPP
