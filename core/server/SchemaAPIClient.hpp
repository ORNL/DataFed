#ifndef SCHEMAAPICLIENT_HPP
#define SCHEMAAPICLIENT_HPP
#pragma once

#include "SchemaAPIConfig.hpp"
#include "common/DynaLog.hpp"

#include <curl/curl.h>
#include <nlohmann/json.hpp>

#include <map>
#include <optional>
#include <string>

namespace SDMS {
namespace Core {

/**
 * @brief Low-level REST client for the external Schema Management API.
 *
 * Thin HTTP wrapper — business logic lives in storage/validator classes.
 *
 * NOT thread-safe: owns a single CURL handle. Create one instance per
 * thread if concurrent access is needed.
 *
 * Constructed with a SchemaAPIConfig. If base_url is empty, isConfigured()
 * returns false and all operations throw.
 */
class SchemaAPIClient {
public:
  explicit SchemaAPIClient(const SchemaAPIConfig &a_config);
  ~SchemaAPIClient();

  SchemaAPIClient(const SchemaAPIClient &) = delete;
  SchemaAPIClient &operator=(const SchemaAPIClient &) = delete;

  bool isConfigured() const { return !m_config.base_url.empty(); }

  // ── Custom Headers ────────────────────────────────────────────────────

  /**
   * @brief Set additional HTTP headers appended to every request.
   *
   * Replaces any previously set custom headers. Headers persist across
   * requests until replaced or cleared.
   *
   * Intended for integration testing (e.g. Prism's Prefer header to select
   * response examples/status codes). Production code should not need this.
   *
   * @param a_headers Map of header name → value.
   */
  void setCustomHeaders(const std::map<std::string, std::string> &a_headers);

  /**
   * @brief Remove all custom headers.
   */
  void clearCustomHeaders();

  // ── Storage Operations ────────────────────────────────────────────────

  /**
   * @brief Create or replace a schema at the given ID (PUT /schemas/{id}).
   *
   * Per OpenAPI spec (SchemaReplace), required body fields:
   *   name, schema_format, engine, content
   * Optional body fields: description, version, revise
   *
   * @param a_id            Schema identifier (path parameter only).
   * @param a_name          Schema name (required).
   * @param a_description   Schema description (omitted from body if empty).
   * @param a_schema_format Serialization format: "json", "yaml", "xml".
   * @param a_engine        Validation engine: "JSONSchema", "LinkML", etc.
   * @param a_content       Raw schema content as text.
   * @param a_version       Semantic version string (omitted from body if empty).
   * @param log_context     Logging context.
   */
  void putSchema(const std::string &a_id, const std::string &a_name,
                 const std::string &a_description,
                 const std::string &a_schema_format,
                 const std::string &a_engine, const std::string &a_content,
                 const std::string &a_version, LogContext log_context);

  /**
   * @brief Partially update a schema (PATCH /schemas/{id}).
   *
   * Per OpenAPI spec (SchemaPatch), all body fields are optional.
   *
   * @param a_id            Schema identifier (path parameter only).
   * @param a_name          Updated name (nullopt = unchanged).
   * @param a_description   Updated description (nullopt = unchanged).
   * @param a_schema_format Updated format (nullopt = unchanged).
   * @param a_engine        Updated engine (nullopt = unchanged).
   * @param a_content       Updated content (nullopt = unchanged).
   * @param a_version       Updated version (nullopt = unchanged).
   * @param log_context     Logging context.
   */
  void patchSchema(const std::string &a_id,
                   const std::optional<std::string> &a_name,
                   const std::optional<std::string> &a_description,
                   const std::optional<std::string> &a_schema_format,
                   const std::optional<std::string> &a_engine,
                   const std::optional<std::string> &a_content,
                   const std::optional<std::string> &a_version,
                   LogContext log_context);

  /**
   * @brief Retrieve a schema by ID (GET /schemas/{id}).
   */
  nlohmann::json getSchema(const std::string &a_id, LogContext log_context);

  /**
   * @brief Delete a schema by ID (DELETE /schemas/{id}).
   */
  void deleteSchema(const std::string &a_id, LogContext log_context);

  // ── Validation Operations ─────────────────────────────────────────────

  /**
   * @brief Validate a schema definition (POST /schemas/validate).
   *
   * @param a_schema_format Serialization format ("json", "yaml", "xml").
   * @param a_engine        Validation engine ("JSONSchema", "LinkML", etc.).
   * @param a_content       Schema definition to validate.
   * @param a_errors        [out] Error details on failure.
   * @param log_context     Logging context.
   * @return true if valid.
   */
  bool validateSchema(const std::string &a_schema_format,
                      const std::string &a_engine,
                      const std::string &a_content, std::string &a_errors,
                      LogContext log_context);

  /**
   * @brief Validate metadata against a stored schema
   *        (POST /schemas/{id}/validate).
   *
   * @param a_schema_id        Schema ID (path parameter only).
   * @param a_metadata_format  Format of the metadata ("json", "yaml").
   * @param a_engine           Validation engine to use.
   * @param a_metadata_content Metadata to validate.
   * @param a_errors           [out] Error details on failure.
   * @param a_warnings         [out] Warnings (may be present even on success).
   * @param log_context        Logging context.
   * @return true if valid.
   */
  bool validateMetadata(const std::string &a_schema_id,
                        const std::string &a_metadata_format,
                        const std::string &a_engine,
                        const std::string &a_metadata_content,
                        std::string &a_errors, std::string &a_warnings,
                        LogContext log_context);

private:
  nlohmann::json httpGet(const std::string &a_path, LogContext log_context);
  nlohmann::json httpPost(const std::string &a_path,
                          const nlohmann::json &a_body, long &a_http_code,
                          LogContext log_context);
  nlohmann::json httpPut(const std::string &a_path,
                         const nlohmann::json &a_body,
                         LogContext log_context);
  nlohmann::json httpPatch(const std::string &a_path,
                           const nlohmann::json &a_body,
                           LogContext log_context);
  void httpDelete(const std::string &a_path, LogContext log_context);

  nlohmann::json curlPerform(const std::string &a_method,
                             const std::string &a_url,
                             const std::string *a_body, long &a_http_code,
                             LogContext log_context);

  SchemaAPIConfig m_config;
  CURL *m_curl;
  std::map<std::string, std::string> m_custom_headers;
};

} // namespace Core
} // namespace SDMS

#endif
