#include "SchemaAPIClient.hpp"
#include "common/TraceException.hpp"
#include "common/envelope.pb.h"

#include <sstream>

namespace SDMS {
namespace Core {

static size_t schemaApiWriteCB(char *ptr, size_t size, size_t nmemb,
                               void *userdata) {
  auto *buf = static_cast<std::string *>(userdata);
  buf->append(ptr, size * nmemb);
  return size * nmemb;
}

SchemaAPIClient::SchemaAPIClient(const SchemaAPIConfig &a_config)
    : m_config(a_config), m_curl(nullptr) {
  if (!m_config.isConfigured())
    return;

  // Normalize URL
  if (!m_config.base_url.empty() && m_config.base_url.back() == '/')
    m_config.base_url.pop_back();

  m_curl = curl_easy_init();
  if (!m_curl)
    EXCEPT(INTERNAL_ERROR, "SchemaAPIClient: libcurl init failed");

  curl_easy_setopt(m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
  curl_easy_setopt(m_curl, CURLOPT_WRITEFUNCTION, schemaApiWriteCB);
  curl_easy_setopt(m_curl, CURLOPT_TCP_NODELAY, 1);

  // ── TLS Configuration ─────────────────────────────────────────────────
  curl_easy_setopt(m_curl, CURLOPT_SSL_VERIFYPEER,
                   m_config.verify_ssl ? 1L : 0L);
  curl_easy_setopt(m_curl, CURLOPT_SSL_VERIFYHOST,
                   m_config.verify_ssl ? 2L : 0L);

  if (!m_config.ca_cert_path.empty())
    curl_easy_setopt(m_curl, CURLOPT_CAINFO, m_config.ca_cert_path.c_str());

  // Client certificate for mTLS (optional)
  if (m_config.hasMTLS()) {
    curl_easy_setopt(m_curl, CURLOPT_SSLCERT, m_config.client_cert_path.c_str());
    curl_easy_setopt(m_curl, CURLOPT_SSLKEY, m_config.client_key_path.c_str());
  }

  // ── Timeouts ──────────────────────────────────────────────────────────
  curl_easy_setopt(m_curl, CURLOPT_CONNECTTIMEOUT, m_config.connect_timeout_sec);
  curl_easy_setopt(m_curl, CURLOPT_TIMEOUT, m_config.request_timeout_sec);
}

SchemaAPIClient::~SchemaAPIClient() {
  if (m_curl)
    curl_easy_cleanup(m_curl);
}

// ── Low-level CURL ──────────────────────────────────────────────────────────

nlohmann::json SchemaAPIClient::curlPerform(const std::string &a_method,
                                            const std::string &a_url,
                                            const std::string *a_body,
                                            long &a_http_code,
                                            LogContext log_context) {
  if (!m_curl)
    EXCEPT(INTERNAL_ERROR,
           "SchemaAPIClient: not configured (no base URL provided)");

  std::string res_buf;
  char error[CURL_ERROR_SIZE] = {};

  curl_easy_setopt(m_curl, CURLOPT_URL, a_url.c_str());
  curl_easy_setopt(m_curl, CURLOPT_WRITEDATA, &res_buf);
  curl_easy_setopt(m_curl, CURLOPT_ERRORBUFFER, error);
  curl_easy_setopt(m_curl, CURLOPT_CUSTOMREQUEST, a_method.c_str());

  struct curl_slist *headers = nullptr;
  headers = curl_slist_append(headers, "Content-Type: application/json");
  headers = curl_slist_append(headers, "Accept: application/json");

  std::string corr_header = "x-correlation-id: " + log_context.correlation_id;
  headers = curl_slist_append(headers, corr_header.c_str());

  curl_easy_setopt(m_curl, CURLOPT_HTTPHEADER, headers);

  if (a_body && !a_body->empty()) {
    curl_easy_setopt(m_curl, CURLOPT_POSTFIELDS, a_body->c_str());
    curl_easy_setopt(m_curl, CURLOPT_POSTFIELDSIZE,
                     static_cast<long>(a_body->size()));
  } else {
    curl_easy_setopt(m_curl, CURLOPT_POSTFIELDS, nullptr);
    curl_easy_setopt(m_curl, CURLOPT_POSTFIELDSIZE, 0L);
  }

  DL_DEBUG(log_context, "SchemaAPI " << a_method << " " << a_url);

  CURLcode res = curl_easy_perform(m_curl);
  curl_easy_getinfo(m_curl, CURLINFO_RESPONSE_CODE, &a_http_code);
  curl_slist_free_all(headers);

  if (res != CURLE_OK)
    EXCEPT_PARAM(SERVICE_ERROR,
                 "SchemaAPI request failed: " << error << ", "
                                              << curl_easy_strerror(res));

  DL_DEBUG(log_context, "SchemaAPI response " << a_http_code << " ["
                                              << res_buf.size() << " bytes]");

  nlohmann::json result;
  if (!res_buf.empty()) {
    try {
      result = nlohmann::json::parse(res_buf);
    } catch (const nlohmann::json::parse_error &e) {
      DL_ERROR(log_context, "SchemaAPI: invalid JSON response: " << e.what());
      EXCEPT_PARAM(SERVICE_ERROR,
                   "SchemaAPI returned invalid JSON: " << e.what());
    }
  }

  return result;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

nlohmann::json SchemaAPIClient::httpGet(const std::string &a_path,
                                        LogContext log_context) {
  long code = 0;
  auto result =
      curlPerform("GET", m_config.base_url + a_path, nullptr, code, log_context);
  if (code == 404)
    EXCEPT_PARAM(BAD_REQUEST, "SchemaAPI: not found: " << a_path);
  if (code < 200 || code >= 300)
    EXCEPT_PARAM(SERVICE_ERROR, "SchemaAPI GET failed, HTTP " << code);
  return result;
}

nlohmann::json SchemaAPIClient::httpPost(const std::string &a_path,
                                         const nlohmann::json &a_body,
                                         long &a_http_code,
                                         LogContext log_context) {
  std::string body_str = a_body.dump();
  return curlPerform("POST", m_config.base_url + a_path, &body_str, a_http_code,
                     log_context);
}

nlohmann::json SchemaAPIClient::httpPut(const std::string &a_path,
                                        const nlohmann::json &a_body,
                                        LogContext log_context) {
  long code = 0;
  std::string body_str = a_body.dump();
  auto result =
      curlPerform("PUT", m_config.base_url + a_path, &body_str, code, log_context);
  if (code < 200 || code >= 300)
    EXCEPT_PARAM(SERVICE_ERROR, "SchemaAPI PUT failed, HTTP " << code);
  return result;
}

nlohmann::json SchemaAPIClient::httpPatch(const std::string &a_path,
                                          const nlohmann::json &a_body,
                                          LogContext log_context) {
  long code = 0;
  std::string body_str = a_body.dump();
  auto result =
      curlPerform("PATCH", m_config.base_url + a_path, &body_str, code, log_context);
  if (code == 404)
    EXCEPT_PARAM(BAD_REQUEST, "SchemaAPI: not found for PATCH");
  if (code < 200 || code >= 300)
    EXCEPT_PARAM(SERVICE_ERROR, "SchemaAPI PATCH failed, HTTP " << code);
  return result;
}

void SchemaAPIClient::httpDelete(const std::string &a_path,
                                 LogContext log_context) {
  long code = 0;
  curlPerform("DELETE", m_config.base_url + a_path, nullptr, code, log_context);
  if (code != 204 && code != 404)
    EXCEPT_PARAM(SERVICE_ERROR, "SchemaAPI DELETE failed, HTTP " << code);
}

// ── Storage Operations ──────────────────────────────────────────────────────

void SchemaAPIClient::putSchema(const std::string &a_id,
                                const std::string &a_name,
                                const std::string &a_description,
                                const std::string &a_content,
                                LogContext log_context) {
  nlohmann::json body;
  body["id"] = a_id;
  body["name"] = a_name;
  body["content"] = a_content;
  if (!a_description.empty())
    body["description"] = a_description;

  httpPut("/schemas/" + a_id, body, log_context);
}

void SchemaAPIClient::patchSchema(const std::string &a_id,
                                  const std::optional<std::string> &a_name,
                                  const std::optional<std::string> &a_description,
                                  const std::optional<std::string> &a_content,
                                  LogContext log_context) {
  nlohmann::json body;
  body["id"] = a_id;
  if (a_name)
    body["name"] = *a_name;
  if (a_description)
    body["description"] = *a_description;
  if (a_content)
    body["content"] = *a_content;

  httpPatch("/schemas/" + a_id, body, log_context);
}

nlohmann::json SchemaAPIClient::getSchema(const std::string &a_id,
                                          LogContext log_context) {
  return httpGet("/schemas/" + a_id, log_context);
}

void SchemaAPIClient::deleteSchema(const std::string &a_id,
                                   LogContext log_context) {
  httpDelete("/schemas/" + a_id, log_context);
}

// ── Validation Operations ───────────────────────────────────────────────────

bool SchemaAPIClient::validateSchema(const std::string &a_schema_format,
                                     const std::string &a_engine,
                                     const std::string &a_content,
                                     std::string &a_errors,
                                     LogContext log_context) {
  nlohmann::json body;
  body["schema_format"] = a_schema_format;
  body["engine"] = a_engine;
  body["content"] = a_content;

  long code = 0;
  auto result = httpPost("/schemas/validate", body, code, log_context);

  if (code == 200)
    return true;
  if (code == 422) {
    a_errors = result.value("message", "validation failed");
    return false;
  }
  EXCEPT_PARAM(SERVICE_ERROR,
               "SchemaAPI validateSchema failed, HTTP " << code);
}

bool SchemaAPIClient::validateMetadata(const std::string &a_schema_id,
                                       const std::string &a_metadata_format,
                                       const std::string &a_engine,
                                       const std::string &a_metadata_content,
                                       std::string &a_errors,
                                       std::string &a_warnings,
                                       LogContext log_context) {
  nlohmann::json body;
  body["id"] = a_schema_id;
  body["metadata_format"] = a_metadata_format;
  body["engine"] = a_engine;
  body["content"] = a_metadata_content;

  long code = 0;
  auto result = httpPost("/schemas/" + a_schema_id + "/validate", body, code,
                         log_context);

  if (code == 200) {
    a_warnings = result.value("warnings", "");
    return true;
  }
  if (code == 422) {
    a_errors = result.value("message", "metadata validation failed");
    return false;
  }
  if (code == 404)
    EXCEPT_PARAM(BAD_REQUEST,
                 "SchemaAPI: schema " << a_schema_id << " not found");
  EXCEPT_PARAM(SERVICE_ERROR,
               "SchemaAPI validateMetadata failed, HTTP " << code);
}

} // namespace Core
} // namespace SDMS
