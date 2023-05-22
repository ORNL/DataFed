#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE buffer
#include <boost/test/unit_test.hpp>

// Local public includes
#include "common/DynaLog.hpp"

// Standard includes
#include <iostream>
#include <filesystem>
#include <fstream>
#include <regex>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(LogTest)

BOOST_AUTO_TEST_CASE( testing_LogOutput ) {

  std::string file_name ="./log_output_test1.txt";
  global_logger.setLevel(SDMS::LogLevel::TRACE);
  LogContext log_context;
  log_context.thread_name = "test_thread"; 
  log_context.thread_id = 1;
  log_context.correlation_id = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY";

  // Remove file if it exists
  bool file_removed = true;
  std::cout << "File exists" << std::endl;
  if (std::filesystem::exists(file_name)) {
    std::cout << "Yes" << std::endl;
    file_removed = false;
    if(std::filesystem::remove(file_name)) {
      std::cout << "Removing file" << std::endl;
      file_removed = true; 
    }
  }

  BOOST_CHECK(file_removed);

  std::ofstream file(file_name);
  //global_log_settings.output_stream.rdbuf(file.rdbuf());
  global_logger.addStream(file);
  // Writing to file
  std::string message = "This is a test message";
  DL_CRITICAL(log_context, message);
  DL_ERROR(log_context, message);
  DL_WARNING(log_context, message);
  DL_INFO(log_context, message);
  DL_DEBUG(log_context, message);
  DL_TRACE(log_context, message);
  
  file.close();

  std::ifstream file2(file_name);
  if( !file2.is_open()) {
    // Unable to open file
    BOOST_CHECK(false);
  } 
  std::regex pattern("\"thread_id\": \"1\", \"correlation_id\": \"XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY\"");

  std::regex pattern_info("INFO");
  std::regex pattern_debug("DEBUG");
  std::regex pattern_trace("TRACE");
  std::regex pattern_critical("CRIT");

  bool found_info = false;
  bool found_trace = false;
  bool found_debug = false;
  bool found_critical = false;

  int count = 0;
  std::string line;
  while(std::getline(file2, line)) {
    if( std::regex_search(line, pattern) ) {
      ++count;
    }
    if( std::regex_search(line, pattern_info) ) {
      found_info = true;
    } else if(std::regex_search(line, pattern_debug )) {
      found_debug = true;
    } else if(std::regex_search(line, pattern_trace )) {
      found_trace = true;
    } else if(std::regex_search(line, pattern_critical )) {
      found_critical = true;
    }
  }
  file2.close();

  BOOST_CHECK(found_info);
  BOOST_CHECK(found_debug);
  BOOST_CHECK(found_trace);
  BOOST_CHECK(found_critical);
  // Should be 6 of the same messages for
  // TRACE
  // DEBUG
  // INFO
  // WARN
  // ERROR
  // CRITICAL
  std::cout << "Count is " << count << std::endl;
  BOOST_CHECK(count==6);
}

BOOST_AUTO_TEST_SUITE_END()

