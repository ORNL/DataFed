#ifndef TESTDATABASEAPI_HPP
#define TESTDATABASEAPI_HPP
#pragma once

#include "DatabaseAPI.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/libjson.hpp"

// Third party includes
#include <curl/curl.h>

// Standard includes
#include <memory>
#include <string>
#include <vector>

namespace SDMS {
namespace Core {

class TestDatabaseAPI {
public:
  TestDatabaseAPI(const std::string &a_db_url, const std::string &a_db_user,
              const std::string &a_db_pass);
  ~TestDatabaseAPI();

  long dbGet(const char *a_url_path,
             const std::vector<std::pair<std::string, std::string>> &a_params,
             libjson::Value &a_result, LogContext, bool a_log = true);
  bool
  dbGetRaw(const char *a_url_path,
           const std::vector<std::pair<std::string, std::string>> &a_params,
           std::string &a_result);
  long dbPost(const char *a_url_path,
              const std::vector<std::pair<std::string, std::string>> &a_params,
              const std::string *a_body, libjson::Value &a_result, LogContext);
};

} // namespace Core
} // namespace SDMS

#endif
