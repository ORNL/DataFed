// Local private includes
#include "GlobusAPI.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// Standard includes
#include <iostream>
#include <time.h>
#include <unistd.h>

using namespace std;
using namespace libjson;

namespace SDMS {
namespace Core {

void GlobusAPI::init() {
  // NOTE: TWO libcurl handles are used due to a bug in version 7.43 - Reusing
  // TLS connections causes a segfault. Have not yet verified
  m_curl_xfr = curl_easy_init();
  if (!m_curl_xfr)
    EXCEPT(1, "libcurl init failed");

  curl_easy_setopt(m_curl_xfr, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
  curl_easy_setopt(m_curl_xfr, CURLOPT_WRITEFUNCTION, curlResponseWriteCB);
  curl_easy_setopt(m_curl_xfr, CURLOPT_SSL_VERIFYPEER, 0);
  curl_easy_setopt(m_curl_xfr, CURLOPT_TCP_NODELAY, 1);

  m_curl_auth = curl_easy_init();
  if (!m_curl_auth)
    EXCEPT(1, "libcurl init failed");

  curl_easy_setopt(m_curl_auth, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
  curl_easy_setopt(m_curl_auth, CURLOPT_WRITEFUNCTION, curlResponseWriteCB);
  curl_easy_setopt(m_curl_auth, CURLOPT_SSL_VERIFYPEER, 0);
  curl_easy_setopt(m_curl_auth, CURLOPT_TCP_NODELAY, 1);
}

GlobusAPI::GlobusAPI() : m_config(Config::getInstance()) { init(); }

GlobusAPI::GlobusAPI(LogContext log_context)
    : m_config(Config::getInstance()), m_log_context(log_context) {
  init();
}

GlobusAPI &GlobusAPI::operator=(GlobusAPI &&other) noexcept {
  if (this != &other) {
    curl_easy_cleanup(m_curl_auth);
    curl_easy_cleanup(m_curl_xfr);
    this->m_curl_xfr = other.m_curl_xfr;
    this->m_curl_auth = other.m_curl_auth;
    other.m_curl_xfr = nullptr;
    other.m_curl_auth = nullptr;
    this->m_log_context = other.m_log_context;
  }
  return *this;
}

GlobusAPI::~GlobusAPI() {
  if(m_curl_auth)
  {
    curl_easy_cleanup(m_curl_auth);
  }
  if(m_curl_xfr)
  {
    curl_easy_cleanup(m_curl_xfr);
  }
}

long GlobusAPI::get(CURL *a_curl, const std::string &a_base_url,
                    const std::string &a_url_path, const std::string &a_token,
                    const vector<pair<string, string>> &a_params,
                    string &a_result) {
  string url;
  char error[CURL_ERROR_SIZE];
  char *esc_txt;

  error[0] = 0;
  url.reserve(512);
  url.append(a_base_url);

  esc_txt = curl_easy_escape(a_curl, a_url_path.c_str(), 0);
  url.append(esc_txt);
  curl_free(esc_txt);

  if (a_params.size() > 0)
    url.append("?");

  for (vector<pair<string, string>>::const_iterator iparam = a_params.begin();
       iparam != a_params.end(); ++iparam) {
    url.append("&");
    url.append(iparam->first.c_str());
    url.append("=");
    esc_txt = curl_easy_escape(a_curl, iparam->second.c_str(), 0);
    url.append(esc_txt);
    curl_free(esc_txt);
  }

  curl_easy_setopt(a_curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(a_curl, CURLOPT_WRITEDATA, &a_result);
  curl_easy_setopt(a_curl, CURLOPT_ERRORBUFFER, error);
  curl_easy_setopt(a_curl, CURLOPT_HTTPGET, 1);

  struct curl_slist *list = 0;

  if (a_token.size()) {
    string auth_hdr = "Authorization: Bearer ";
    auth_hdr += a_token;
    list = curl_slist_append(list, auth_hdr.c_str());
    curl_easy_setopt(a_curl, CURLOPT_HTTPHEADER, list);
  } else {
    curl_easy_setopt(a_curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
    curl_easy_setopt(a_curl, CURLOPT_USERNAME, m_config.client_id.c_str());
    curl_easy_setopt(a_curl, CURLOPT_PASSWORD, m_config.client_secret.c_str());
  }

  CURLcode res = curl_easy_perform(a_curl);

  if (list)
    curl_slist_free_all(list);

  long http_code = 0;
  curl_easy_getinfo(a_curl, CURLINFO_RESPONSE_CODE, &http_code);

  if (res != CURLE_OK) {
    DL_ERROR(m_log_context,
             "CURL error [" << error << "], " << curl_easy_strerror(res));
    EXCEPT_PARAM(1, "Globus API call failed.");
  }

  return http_code;
}

long GlobusAPI::post(
    CURL *a_curl, const std::string &a_base_url, const std::string &a_url_path,
    const std::string &a_token,
    const std::vector<std::pair<std::string, std::string>> &a_params,
    const libjson::Value *a_body, string &a_result) {

  string url;
  char error[CURL_ERROR_SIZE];
  char *esc_txt;

  error[0] = 0;
  url.reserve(512);
  url.append(a_base_url);

  esc_txt = curl_easy_escape(a_curl, a_url_path.c_str(), 0);
  url.append(esc_txt);
  curl_free(esc_txt);

  for (vector<pair<string, string>>::const_iterator iparam = a_params.begin();
       iparam != a_params.end(); ++iparam) {
    if (iparam == a_params.begin()) {
      url.append("?");
    } else {
      url.append("&");
    }

    url.append(iparam->first.c_str());
    url.append("=");
    esc_txt = curl_easy_escape(a_curl, iparam->second.c_str(), 0);
    url.append(esc_txt);
    curl_free(esc_txt);
  }

  // curl_easy_setopt( m_curl, CURLOPT_VERBOSE, 1 );
  curl_easy_setopt(a_curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(a_curl, CURLOPT_WRITEDATA, &a_result);
  curl_easy_setopt(a_curl, CURLOPT_ERRORBUFFER, error);
  curl_easy_setopt(a_curl, CURLOPT_POST, 1);

  string tmp;

  if (a_body) {
    tmp = a_body->toString();
    curl_easy_setopt(a_curl, CURLOPT_POSTFIELDS, tmp.c_str());
  } else
    curl_easy_setopt(a_curl, CURLOPT_POSTFIELDS, "");

  struct curl_slist *list = 0;

  if (a_token.size()) {
    string auth_hdr = "Authorization: Bearer ";
    auth_hdr += a_token;
    list = curl_slist_append(list, auth_hdr.c_str());
  } else {
    curl_easy_setopt(a_curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
    curl_easy_setopt(a_curl, CURLOPT_USERNAME, m_config.client_id.c_str());
    curl_easy_setopt(a_curl, CURLOPT_PASSWORD, m_config.client_secret.c_str());
  }

  if (a_body) {
    list = curl_slist_append(list, "Content-Type: application/json");
  }

  if (list) {
    curl_easy_setopt(a_curl, CURLOPT_HTTPHEADER, list);
  }

  CURLcode res = curl_easy_perform(a_curl);

  if (list)
    curl_slist_free_all(list);

  long http_code = 0;
  curl_easy_getinfo(a_curl, CURLINFO_RESPONSE_CODE, &http_code);

  if (res != CURLE_OK) {
    DL_ERROR(m_log_context,
             "CURL error [" << error << "], " << curl_easy_strerror(res));
    EXCEPT_PARAM(1, "Globus API call failed.");
  }

  return http_code;
}

std::string GlobusAPI::getSubmissionID(const std::string &a_acc_token) {

  string raw_result;
  long code = get(m_curl_xfr, m_config.glob_xfr_url + "submission_id", "",
                  a_acc_token, {}, raw_result);

  try {
    if (!raw_result.size())
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Empty response. Code: " << code);

    Value result;

    result.fromString(raw_result);

    Value::Object &resp_obj = result.asObject();

    checkResponsCode(code, resp_obj);

    return resp_obj.getString("value");
  } catch (libjson::ParseError &e) {
    DL_DEBUG(m_log_context, "PARSE FAILED! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus submission API call returned invalid JSON.");
  } catch (TraceException &e) {
    DL_DEBUG(m_log_context, raw_result);
    e.addContext("Globus submission API call failed.");
    throw;
  } catch (...) {
    DL_DEBUG(m_log_context, "UNEXPECTED/MISSING JSON! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus submission API call returned unexpected content");
  }
}

string GlobusAPI::transfer(
    const std::string &a_src_ep, const std::string &a_dst_ep,
    const std::vector<std::pair<std::string, std::string>> &a_files,
    bool a_encrypt, const std::string &a_acc_token) {

  string sub_id = getSubmissionID(a_acc_token);

  Value body;

  Value::Object &obj = body.initObject();

  obj["DATA_TYPE"] = "transfer";
  obj["submission_id"] = sub_id;
  obj["source_endpoint"] = a_src_ep;
  obj["destination_endpoint"] = a_dst_ep;
  obj["verify_checksum"] = true;
  obj["notify_on_succeeded"] = false;
  obj["encrypt_data"] = a_encrypt;

  Value::Array &xfr_list = obj["DATA"].initArray();
  xfr_list.reserve(a_files.size());

  for (vector<pair<string, string>>::const_iterator f = a_files.begin();
       f != a_files.end(); f++) {

    Value xfr_item;
    Value::Object &xobj = xfr_item.initObject();
    xobj["DATA_TYPE"] = "transfer_item";
    xobj["source_path"] = f->first;
    xobj["destination_path"] = f->second;
    xobj["recursive"] = false;
    xfr_list.push_back(move(xfr_item));
  }

  string raw_result;
  long code = post(m_curl_xfr, m_config.glob_xfr_url + "transfer", "",
                   a_acc_token, {}, &body, raw_result);

  try {
    if (!raw_result.size())
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Empty response. Code: " << code);

    Value result;

    result.fromString(raw_result);

    Value::Object &resp_obj = result.asObject();

    checkResponsCode(code, resp_obj);

    Value::ObjectIter i;

    string &code = resp_obj.getString("code");

    if (code.compare("Accepted") != 0)
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Request not accepted (" << code << ")");

    string &task_id = resp_obj.getString("task_id");

    return task_id;
  } catch (libjson::ParseError &e) {
    DL_ERROR(m_log_context, "PARSE FAILED! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus transfer API call returned invalid JSON.");
  } catch (TraceException &e) {
    DL_ERROR(m_log_context, raw_result);
    e.addContext("Globus transfer API call failed.");
    throw;
  } catch (...) {
    DL_ERROR(m_log_context, "UNEXPECTED EXCEPTION " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus transfer API call returned unexpected content");
  }
}

bool GlobusAPI::checkTransferStatus(const std::string &a_task_id,
                                    const std::string &a_acc_tok,
                                    XfrStatus &a_status,
                                    std::string &a_err_msg) {

  a_status = XS_INIT;
  a_err_msg.clear();
  string raw_result;

  // First check task global status for "SUCEEDED", "FAILED", "INACTIVE"

  long code = get(m_curl_xfr, m_config.glob_xfr_url + "task/",
                  a_task_id /*+ "?fields=status,nice_status"*/, a_acc_tok, {},
                  raw_result);

  try {
    if (!raw_result.size()) {
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Empty response. Code: " << code);
    }

    Value result;
    result.fromString(raw_result);

    Value::Object &resp_obj = result.asObject();
    string &status = resp_obj.getString("status");

    if (status == "ACTIVE") {

      double faults = resp_obj.getNumber("faults");
      if (faults > 30.0) {

        DL_WARNING(m_log_context, "faults encountered for task: "
                                      << a_task_id << " faults " << faults);
        string raw_result2;
        get(m_curl_xfr, m_config.glob_xfr_url + "task/",
            a_task_id + "/event_list", a_acc_tok, {}, raw_result2);
        Value result2;
        result2.fromString(raw_result2);
        Value::Object &resp_obj2 = result2.asObject();

        Value::Array &data_arr = resp_obj2.getArray("DATA");

        Value::Object &event = data_arr.front().asObject();
        if (event.getBool("is_error")) {
          DL_ERROR(m_log_context,
                   "Error encountered is_error True printing error message: "
                       << event.getString("details"));
        }

        const double task_attempts = 2.0;
        if (resp_obj2.getNumber("total") > task_attempts) {
          a_err_msg = resp_obj.getString("nice_status");
          DL_DEBUG(m_log_context,
                   "Aborting task exceeded acceptable transfer attempts");
          a_status = XS_FAILED;
          return true;
        }
      }

      a_status = XS_ACTIVE;
      return false;

    } else if (status == "SUCCEEDED") {
      a_status = XS_SUCCEEDED;
      return false;
    } else if (status == "FAILED" || status == "INACTIVE") {

      a_err_msg = resp_obj.getString("nice_status");
      a_status = XS_FAILED;
      return true;
    }
  } catch (libjson::ParseError &e) {
    DL_ERROR(m_log_context, "PARSE FAILED! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus task view API call returned invalid JSON.");
  } catch (TraceException &e) {
    DL_ERROR(m_log_context, raw_result);
    e.addContext("Globus task view API call failed.");
    throw;
  } catch (...) {
    DL_ERROR(m_log_context, "UNEXPECTED/MISSING JSON! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus task view API call returned unexpected content");
  }

  // If task status is "ACTIVE", also check event list for transient errors that
  // should map to fatal errors

  raw_result.clear();
  code = get(m_curl_xfr, m_config.glob_xfr_url + "task/",
             a_task_id + "/event_list", a_acc_tok, {}, raw_result);

  try {
    if (!raw_result.size())
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Empty response. Code: " << code);

    Value result;

    result.fromString(raw_result);

    Value::Object &resp_obj = result.asObject();

    checkResponsCode(code, resp_obj);

    string &data_type = resp_obj.getString("DATA_TYPE");

    if (data_type.compare("event_list") != 0)
      EXCEPT(ID_SERVICE_ERROR, "Invalid DATA_TYPE field.");

    vector<string> events;

    Value::Array &arr = resp_obj.getArray("DATA");

    for (Value::ArrayIter i = arr.begin(); i != arr.end(); i++) {
      Value::Object &dobj = i->asObject();

      if (dobj.getBool("is_error")) {
        a_status = XS_FAILED;
        a_err_msg = dobj.getString("description");
        return true;
      }

      events.push_back(dobj.getString("code"));
    }

    // Look for certain transient error events that should be treated as
    // permanent errors
    return eventsHaveErrors(events, a_status, a_err_msg);
  } catch (libjson::ParseError &e) {
    DL_ERROR(m_log_context, "PARSE FAILED! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus task event list API call returned invalid JSON.");
  } catch (TraceException &e) {
    DL_ERROR(m_log_context, raw_result);
    e.addContext("Globus task event list API call failed.");
    throw;
  } catch (...) {
    DL_ERROR(m_log_context, "UNEXPECTED/MISSING JSON! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus task event list API call returned unexpected content");
  }
}

void GlobusAPI::cancelTask(const std::string &a_task_id,
                           const std::string &a_acc_tok) {

  string raw_result;

  long code = post(m_curl_xfr, m_config.glob_xfr_url + "task/",
                   a_task_id + "/cancel", a_acc_tok, {}, 0, raw_result);

  try {
    if (!raw_result.size())
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Empty response. Code: " << code);

    Value result;

    result.fromString(raw_result);

    Value::Object &resp_obj = result.asObject();

    checkResponsCode(code, resp_obj);

    string &resp_code = resp_obj.getString("code");

    if (resp_code != "Canceled")
      EXCEPT_PARAM(ID_SERVICE_ERROR,
                   "Unexpected 'code' value returned: " << resp_code);
  } catch (libjson::ParseError &e) {
    DL_ERROR(m_log_context, "PARSE FAILED! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus cancel task API call returned invalid JSON.");
  } catch (TraceException &e) {
    DL_ERROR(m_log_context, raw_result);
    e.addContext("Globus cancel task API call failed.");
    throw;
  } catch (...) {
    DL_ERROR(m_log_context, "UNEXPECTED/MISSING JSON! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus cancel task API call returned unexpected content");
  }
}

/**
 * @return True if task has errors and needs to be cancelled, false otherwise
 */
bool GlobusAPI::eventsHaveErrors(const vector<string> &a_events,
                                 XfrStatus &a_status, std::string &a_err_msg) {
  a_status = XS_INIT;
  size_t fault_count = 0;

  // Processing events in order of oldest first
  for (vector<string>::const_reverse_iterator istat = a_events.rbegin();
       istat != a_events.rend(); ++istat) {
    if (*istat == "STARTED" || *istat == "PROGRESS" || *istat == "SUCCEEDED") {
      a_status = XS_ACTIVE;
    } else if (*istat == "CANCELED") {
      a_status = XS_FAILED;
      a_err_msg = *istat;
      break;
    } else if (*istat == "CONNECTION_RESET") {
      a_status = XS_INIT;
      if (++fault_count > 10) {
        a_status = XS_FAILED;
        a_err_msg = "Could not connect";
        return true;
      }
    } else {
      a_status = XS_FAILED;
      a_err_msg = *istat;
      return true;
    }
  }

  return false;
}

void GlobusAPI::getEndpointInfo(const std::string &a_ep_id,
                                const std::string &a_acc_token,
                                EndpointInfo &a_ep_info) {

  string raw_result;
  long code = get(m_curl_xfr, m_config.glob_xfr_url + "endpoint/", a_ep_id,
                  a_acc_token, {}, raw_result);

  Value result;
  try {
    if (!raw_result.size())
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Empty response. Code: " << code);

    result.fromString(raw_result);

    Value::Object &resp_obj = result.asObject();

    checkResponsCode(code, resp_obj);

    a_ep_info.id = a_ep_id;
    a_ep_info.activated = resp_obj.getBool("activated");

    int64_t exp = resp_obj.getNumber("expires_in");
    if (exp < 0) {
      a_ep_info.activated = true;
      a_ep_info.never_expires = true;
      a_ep_info.expiration = 0;
    } else {
      a_ep_info.never_expires = false;
      a_ep_info.expiration = time(0) + exp;
    }

    a_ep_info.force_encryption = resp_obj.getBool("force_encryption");
    if (a_ep_info.force_encryption)
      a_ep_info.supports_encryption = true;
    else {
      a_ep_info.supports_encryption = false;

      // Look at DATA[0].scheme to see if it's gsiftp
      Value::Array &data = resp_obj.getArray("DATA");

      if (data.size() > 0) {
        Value::Object &server_obj = data[0].asObject();

        Value &scheme = server_obj.getValue("scheme");

        if (scheme.isNull())
          a_ep_info.supports_encryption = true;
        else if (scheme.isString())
          a_ep_info.supports_encryption =
              (scheme.asString().compare("gsiftp") == 0);
      }
    }
  } catch (libjson::ParseError &e) {
    DL_ERROR(m_log_context, "PARSE FAILED! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus endpoint API call returned invalid JSON.");
  } catch (TraceException &e) {
    DL_ERROR(m_log_context, raw_result);
    DL_ERROR(m_log_context, "Result type: " << result.getTypeString());
    e.addContext("Globus endpoint API call failed.");
    throw;
  } catch (exception &e) {
    DL_ERROR(m_log_context, "UNEXPECTED/MISSING JSON! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus endpoint API call returned unexpected content");
  }
}

void GlobusAPI::refreshAccessToken(const std::string &a_ref_tok,
                                   std::string &a_new_acc_tok,
                                   uint32_t &a_expires_in) {

  string raw_result;
  long code =
      post(m_curl_auth, m_config.glob_oauth_url + "token", "", "",
           {{"refresh_token", a_ref_tok}, {"grant_type", "refresh_token"}}, 0,
           raw_result);

  if (!raw_result.size()) {
    EXCEPT_PARAM(
        ID_SERVICE_ERROR,
        "Globus token API call returned empty response. Code: " << code);
  }

  try {
    Value result;

    result.fromString(raw_result);

    Value::Object &resp_obj = result.asObject();

    checkResponsCode(code, resp_obj);

    a_new_acc_tok = resp_obj.getString("access_token");
    a_expires_in = (uint32_t)resp_obj.getNumber("expires_in");
  } catch (libjson::ParseError &e) {
    DL_ERROR(m_log_context,
             "PARSE FAILED! Globus token API call returned invalid JSON");
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus token API call returned invalid JSON.");
  } catch (TraceException &e) {
    DL_ERROR(m_log_context, raw_result);
    e.addContext("Globus token API call failed.");
    throw;
  } catch (exception &e) {
    DL_ERROR(m_log_context, "UNEXPECTED/MISSING JSON! " << raw_result);
    EXCEPT_PARAM(ID_SERVICE_ERROR,
                 "Globus token API call returned unexpected content");
  }
}

void GlobusAPI::checkResponsCode(long a_code,
                                 libjson::Value::Object &a_body) const {
  if (a_code < 200 || a_code > 202) {
    libjson::Value::ObjectIter i = a_body.find("message");
    if (i == a_body.end())
      EXCEPT_PARAM(ID_SERVICE_ERROR, "Request failed, code: " << a_code);
    else
      EXCEPT_PARAM(ID_SERVICE_ERROR,
                   "Request failed, code: " << a_code << ", reason: "
                                            << i->second.asString());
  }
}

} // namespace Core
} // namespace SDMS
