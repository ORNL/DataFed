#ifndef GLOBUSAPICLIENT_HPP
#define GLOBUSAPICLIENT_HPP
#pragma once

// Local private includes
#include "Config.hpp"

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

class GlobusAPI {
public:
  enum XfrStatus {
    XS_INIT = 0,
    XS_ACTIVE,
    XS_INACTIVE,
    XS_SUCCEEDED,
    XS_FAILED
  };

  class IGlobusAPIClient {
  public:
    virtual void cb_GetTransferID() = 0;
    virtual void cb_StartTransfer() = 0;
    virtual void cb_CheckTransfer() = 0;
    virtual void cb_CancelTransfer() = 0;
  };

  struct EndpointInfo {
    std::string id;
    bool activated;
    bool never_expires;
    uint32_t expiration;
    bool supports_encryption;
    bool force_encryption;
  };

  GlobusAPI();
  explicit GlobusAPI(LogContext log_context);

  GlobusAPI &operator=(GlobusAPI &&other) noexcept;

  ~GlobusAPI();

  std::string
  transfer(const std::string &a_src_ep, const std::string &a_dst_ep,
           const std::vector<std::pair<std::string, std::string>> &a_files,
           bool a_encrypt, const std::string &a_acc_token);
  bool checkTransferStatus(const std::string &a_task_id,
                           const std::string &a_acc_tok, XfrStatus &a_status,
                           std::string &a_err_msg, const uint32_t retries);
  void cancelTask(const std::string &a_task_id, const std::string &a_acc_tok);
  void getEndpointInfo(const std::string &a_ep_id,
                       const std::string &a_acc_token, EndpointInfo &a_ep_info);
  void refreshAccessToken(const std::string &a_ref_tok,
                          std::string &a_new_acc_tok, uint32_t &a_expires_in);

private:
  void init();
  long get(CURL *a_curl, const std::string &a_base_url,
           const std::string &a_url_path, const std::string &a_token,
           const std::vector<std::pair<std::string, std::string>> &a_params,
           std::string &a_result);
  long post(CURL *a_curl, const std::string &a_base_url,
            const std::string &a_url_path, const std::string &a_token,
            const std::vector<std::pair<std::string, std::string>> &a_params,
            const libjson::Value *a_body, std::string &a_result);
  std::string getSubmissionID(const std::string &a_acc_token);
  bool eventsHaveErrors(const std::vector<std::string> &a_events,
                        XfrStatus &status, std::string &a_err_msg);
  void checkResponsCode(long a_code, libjson::Value::Object &a_body) const;

  Config &m_config;
  CURL *m_curl_xfr;
  CURL *m_curl_auth;
  LogContext m_log_context;
};

} // namespace Core
} // namespace SDMS

#endif
