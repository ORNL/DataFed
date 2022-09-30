#ifndef DYNADL_HPP
#define DYNADL_HPP


#ifdef USE_DYNALOG

// Trace lines are disabled by default to avoid overhead, define DL_IMPL_TRACE to enable
//#define DL_IMPL_TRACE

#include <ctime>
#include <iomanip>
#include <iostream>
#include <fstream>
#include <syslog.h>
#include <sstream>
//#include <boost/thread/mutex.hpp>

namespace DynaLog
{

enum Level
{
    DL_EMERG_LEV = LOG_EMERG,
    DL_ERROR_LEV = LOG_ERR,
    DL_WARN_LEV  = LOG_WARNING,
    DL_INFO_LEV  = LOG_INFO,
    DL_DEBUG_LEV = LOG_DEBUG,
    DL_TRACE_LEV = LOG_DEBUG + 1 // syslog doesn't support trace-level
};

//static std::time_t g_time; //= std::time(nullptr);
//static std::tm local_time; //= std::localtime(&DynaLog::g_time);

#ifdef DEF_DYNALOG

bool                        g_enabled = true;
int                         g_level = DL_INFO_LEV;
bool                        g_use_cerr = true;
bool                        g_use_syslog = false;
bool                        g_use_prefix = false;
std::stringstream           g_stream_buf;
std::string                 g_log_prefix = "";
//boost::mutex                g_mutex;

#else

extern bool                 g_enabled;
extern int                  g_level;
extern bool                 g_use_cerr;
extern bool                 g_use_syslog;
extern bool                 g_use_prefix;
extern std::stringstream    g_stream_buf;
extern std::string          g_log_prefix;
//extern std::time_t g_time;
//extern std::tm local_time;

//extern boost::mutex         g_mutex;

#endif

//void DL_INIT() {
//  g_time = std::time(nullptr); 
//  local_time = std::localtime(&g_time);
//}


//if ( DynaLog::g_use_cerr ) { boost::lock_guard<boost::mutex> lock(DynaLog::g_mutex); std::cerr << x << std::endl; }

#define OUTPUT(lev,x) \
    { \
      std::time_t g_time = std::time(nullptr); \
      std::tm local_time = *std::localtime(&g_time); \
      if ( DynaLog::g_use_cerr ) { std::cerr << std::put_time(&local_time, "%d-%m-%y %H-%M-%S ") << __FILE__ << ":" << __LINE__ << " " << x << std::endl; } \
      if ( DynaLog::g_use_syslog ) { \
          DynaLog::g_stream_buf << __FILE__ << ":" << __LINE__ << " " <<  x << std::endl; \
          syslog(lev,"%s",DynaLog::g_stream_buf.str().c_str()); \
          DynaLog::g_stream_buf.str(""); } \
      if ( DynaLog::g_use_prefix ) { \
          DynaLog::g_stream_buf << std::put_time(&local_time, "%d-%m-%y %H-%M-%S ") << __FILE__ << ":" << __LINE__ << " " <<  x << std::endl; \
          openlog( DynaLog::g_log_prefix.c_str(), LOG_CONS, LOG_USER ); \
          syslog(lev,"%s", DynaLog::g_stream_buf.str().c_str()); \
          closelog(); } \
    }

/*          //std::ofstream outfile; \
          //outfile.open(DynaLog::g_log_file, std::ofstream::app | std::ofstream::out); \
          //if ( !outfile.is_open() || !outfile.good() ) { \
          //  EXCEPT_PARAM( 1, "Could not open file: " << DynaLog::g_log_file << " make sure you have permissions to access the path); \
          //} else { \
          //  outfile << DynaLog::g_stream_buf.str(); \
          //  outfile.close(); \
          //} \
          DynaLog::g_stream_buf.str(""); } 
          */

#define OUTPUT_TRACE(x) \
    if ( DynaLog::g_use_cerr ) { std::cerr << x << std::endl; }

    //if ( DynaLog::g_use_cerr ) { boost::lock_guard<boost::mutex> lock(DynaLog::g_mutex); std::cerr << x << std::endl; }

#define DL_SET_ENABLED(x) { DynaLog::g_enabled = x; }
#define DL_SET_LOG_PREFIX(x) { DynaLog::g_log_file = x; }
#define DL_SET_LEVEL(x) { DynaLog::g_level = x; }
#define DL_SET_PREFIX_ENABLED(x) { DynaLog::g_use_prefix = x; }
#define DL_SET_CERR_ENABLED(x) { DynaLog::g_use_cerr = x; }
#define DL_SET_SYSDL_ENABLED(x) { DynaLog::g_use_syslog = x; }

#define DL_EMERG(x) if( DynaLog::g_enabled ) { OUTPUT(DynaLog::DL_EMERG_LEV,x) }
#define DL_ERROR(x) if( DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_ERROR_LEV ) { OUTPUT(DynaLog::DL_ERROR_LEV,x) }
#define DL_WARN(x) if( DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_WARN_LEV ) { OUTPUT(DynaLog::DL_WARN_LEV,x) }
#define DL_INFO(x) if( DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_INFO_LEV ) { OUTPUT(DynaLog::DL_INFO_LEV,x) }
#define DL_DEBUG(x) if( DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_DEBUG_LEV ) { OUTPUT(DynaLog::DL_DEBUG_LEV,x) }
#ifdef DL_IMPL_TRACE
#define DL_TRACE(x) if( DynaLog::g_enabled && DynaLog::g_level >= DynaLog::DL_TRACE_LEV ) { OUTPUT_TRACE(x) }
#else
#define DL_TRACE(x)
#endif

} // DynaLog namespace

#else // Use_DYNALOG

#define DL_SET_ENABLED(x)
#define DL_SET_LEVEL(x)
#define DL_SET_LOG_PREFIX(x) 
#define DL_SET_PREFIX_ENABLED(x)
#define DL_SET_CERR_ENABLED(x)
#define DL_SET_SYSDL_ENABLED(x)
#define DL_EMERG(x)
#define DL_ERROR(x)
#define DL_WARN(x)
#define DL_INFO(x)
#define DL_DEBUG(x)
#define DL_TRACE(x)

#endif // USE_DYNALOG
#endif // DYNADL_HPP
