#pragma once

// Local includes
#include "ISchemaValidator.hpp"

// Third party includes
#include <nlohmann/json-schema.hpp>
#include <nlohmann/json.hpp>

// Standard includes
#include <functional>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>

namespace SDMS {
namespace Core {

/**
 * @brief Schema loader callback type.
 *
 * Called when the validator encounters a $ref that needs resolution.
 * The callback should fetch the schema definition and parse it into JSON.
 *
 * @param schema_id The schema ID to load (from $ref path).
 * @param log_context Logging context.
 * @return Parsed JSON schema, or throws on error.
 */
using SchemaLoaderCallback = std::function<nlohmann::json(
    const std::string &schema_id, LogContext log_context)>;

/**
 * @brief Local JSON Schema validator encapsulating existing DataFed validation.
 *
 * This class wraps the nlohmann::json_schema::json_validator that was
 * previously used directly in ClientWorker. It provides:
 *
 * - Schema definition validation (meta-schema + DataFed requirements)
 * - Metadata validation against cached schemas
 * - Schema reference resolution via callback
 * - Thread-safe compiled schema cache
 *
 * DataFed-specific requirements enforced:
 * - Schema must have "type": "object"
 * - Schema must have "properties" field
 *
 * Thread safety:
 * - Uses shared_mutex for cache (read-many, write-few)
 * - Validation is fully reentrant (no shared mutable state during validation)
 */
class JsonSchemaValidator : public ISchemaValidator {
public:
  /**
   * @brief Construct validator with schema loader callback.
   *
   * @param a_loader Callback to resolve schema $refs. If null, $ref
   *                 resolution will fail.
   */
  explicit JsonSchemaValidator(SchemaLoaderCallback a_loader = nullptr);

  ~JsonSchemaValidator() override = default;

  // Non-copyable (mutex + callback state)
  JsonSchemaValidator(const JsonSchemaValidator &) = delete;
  JsonSchemaValidator &operator=(const JsonSchemaValidator &) = delete;

  // ── ISchemaValidator interface ────────────────────────────────────────────

  /**
   * @brief Validate a JSON Schema definition.
   *
   * Checks:
   * 1. Valid JSON syntax
   * 2. DataFed requirements (type=object, properties field)
   * 3. Valid JSON Schema syntax (compiles with json_validator)
   *
   * @param a_schema_format "json" (yaml not yet supported)
   * @param a_content       Schema definition text
   * @param log_context     Logging context
   * @return Validation result
   */
  ValidationResult validateDefinition(const std::string &a_schema_format,
                                      const std::string &a_content,
                                      LogContext log_context) override;

  /**
   * @brief Validate metadata against a cached schema.
   *
   * The schema must be cached via cacheSchema() first.
   *
   * @param a_schema_id       Schema ID
   * @param a_metadata_format "json" (yaml not yet supported)
   * @param a_metadata_content Metadata to validate
   * @param log_context       Logging context
   * @return Validation result
   */
  ValidationResult validateMetadata(const std::string &a_schema_id,
                                    const std::string &a_metadata_format,
                                    const std::string &a_metadata_content,
                                    LogContext log_context) override;

  bool hasValidationCapability() const override { return true; }

  /**
   * @brief Cache a compiled schema for metadata validation.
   */
  bool cacheSchema(const std::string &a_schema_id, const std::string &a_content,
                   const std::string &a_format,
                   LogContext log_context) override;

  /**
   * @brief Remove a schema from cache.
   */
  void evictSchema(const std::string &a_schema_id) override;

  // ── Additional methods ────────────────────────────────────────────────────

  /**
   * @brief Clear all cached schemas.
   */
  void clearCache();

  /**
   * @brief Check if a schema is cached.
   */
  bool isCached(const std::string &a_schema_id) const;

  /**
   * @brief Set or replace the schema loader callback.
   */
  void setSchemaLoader(SchemaLoaderCallback a_loader);

private:
  /**
   * @brief Enforce DataFed-specific schema requirements.
   *
   * Extracted from ClientWorker::schemaEnforceRequiredProperties().
   * DataFed requires all schemas to have:
   * - "type": "object"
   * - "properties" field (object)
   *
   * @param a_schema Parsed schema JSON
   * @throws std::runtime_error if requirements not met
   */
  void enforceDataFedRequirements(const nlohmann::json &a_schema);

  /**
   * @brief Schema loader adapter for nlohmann json_validator.
   *
   * Converts nlohmann::json_uri to schema_id string and calls the
   * user-provided loader callback.
   */
  void schemaLoaderAdapter(const nlohmann::json_uri &a_uri,
                           nlohmann::json &a_value);

  /**
   * @brief Compile a schema into a validator.
   *
   * @param a_schema Parsed schema JSON
   * @param log_context Logging context (for loader callback)
   * @return Compiled validator
   */
  std::shared_ptr<nlohmann::json_schema::json_validator>
  compileSchema(const nlohmann::json &a_schema, LogContext log_context);

  // Schema loader callback
  SchemaLoaderCallback m_loader;

  // Mutex for protecting m_loader during schemaLoaderAdapter calls
  // (compileSchema sets context, then loader may be called)
  mutable std::mutex m_loader_mutex;
  LogContext m_current_log_context;  // Protected by m_loader_mutex

  // Compiled schema cache
  mutable std::shared_mutex m_cache_mutex;
  std::unordered_map<std::string,
                     std::shared_ptr<nlohmann::json_schema::json_validator>>
      m_schema_cache;
};

} // namespace Core
} // namespace SDMS
