#ifndef TESTGLOBUSAPICLIENT_HPP
#define TESTGLOBUSAPICLIENT_HPP
#pragma once

// Local private includes
#include "GlobusAPI.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/SDMS.pb.h"
#include "common/libjson.hpp"

// Third party includes
#include <curl/curl.h>

// Standard includes
#include <string>
#include <vector>

namespace SDMS {
namespace Core {

class TestGlobusAPI: GlobusAPI {
  TestGlobusAPI();
  explicit TestGlobusAPI(LogContext log_context);

  ~TestGlobusAPI();

public:
  long get(CURL *a_curl, const std::string &a_base_url,
           const std::string &a_url_path, const std::string &a_token,
           const std::vector<std::pair<std::string, std::string>> &a_params,
           std::string &a_result);
  long post(CURL *a_curl, const std::string &a_base_url,
            const std::string &a_url_path, const std::string &a_token,
            const std::vector<std::pair<std::string, std::string>> &a_params,
            const libjson::Value *a_body, std::string &a_result);
};

} // namespace Core
} // namespace SDMS

#endif
