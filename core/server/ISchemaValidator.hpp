#ifndef ISCHEMAVALIDATOR_HPP
#define ISCHEMAVALIDATOR_HPP
#pragma once

#include "common/DynaLog.hpp"

#include <string>

namespace SDMS {
namespace Core {

/**
 * @brief Result of a validation operation.
 *
 * Use the static factory methods Ok() and Fail() for construction.
 */
struct ValidationResult {
  bool valid = false;   ///< True if validation passed
  std::string errors;   ///< Error details if invalid (empty when valid)
  std::string warnings; ///< Warnings (may be present even when valid)

  /**
   * @brief Create a successful validation result.
   * @param a_warnings Optional warning message.
   */
  static ValidationResult Ok(const std::string &a_warnings = "") {
    return {true, "", a_warnings};
  }

  /**
   * @brief Create a failed validation result.
   * @param a_errors Error message describing the validation failure.
   */
  static ValidationResult Fail(const std::string &a_errors) {
    return {false, a_errors, ""};
  }
};

/**
 * @brief Interface for schema validation.
 *
 * This abstraction handles HOW schema definitions and metadata are validated.
 * Implementations exist for different validation engines:
 *
 * - JsonSchemaValidator: Local JSON Schema validation (no network)
 * - ExternalSchemaValidator: Delegates to external API (LinkML, XSD, etc.)
 * - NullSchemaValidator: No-op for legacy/native schemas
 *
 * Storage is handled separately by ISchemaStorage.
 *
 * ## Thread Safety
 *
 * Implementations must document their thread safety guarantees:
 * - JsonSchemaValidator: Thread-safe (uses shared_mutex for cache)
 * - ExternalSchemaValidator: NOT thread-safe (owns CURL handle)
 * - NullSchemaValidator: Thread-safe (stateless)
 *
 * ## Usage Pattern
 *
 * ```cpp
 * // Schema definition validation (before storing)
 * auto result = validator->validateDefinition("json", schema_content, ctx);
 * if (!result.valid) {
 *   // Handle error: result.errors contains details
 * }
 *
 * // Cache schema for metadata validation
 * validator->cacheSchema(schema_id, schema_content, "json", ctx);
 *
 * // Metadata validation (against cached schema)
 * auto md_result = validator->validateMetadata(schema_id, "json", metadata, ctx);
 * if (!md_result.valid) {
 *   // Handle error
 * }
 * ```
 */
class ISchemaValidator {
public:
  virtual ~ISchemaValidator() = default;

  // ── Core Validation Methods ───────────────────────────────────────────────

  /**
   * @brief Validate a schema definition before storing it.
   *
   * Checks that the schema itself is well-formed according to its engine.
   * For JSON Schema, this validates against the JSON Schema meta-schema
   * and enforces DataFed-specific requirements (type=object, properties).
   *
   * @param a_schema_format Serialization format ("json", "yaml").
   * @param a_content       Schema definition text to validate.
   * @param log_context     Logging/correlation context.
   * @return Validation result with valid flag and any errors/warnings.
   */
  virtual ValidationResult
  validateDefinition(const std::string &a_schema_format,
                     const std::string &a_content,
                     LogContext log_context) = 0;

  /**
   * @brief Validate metadata content against a schema.
   *
   * For validators with local caching (JsonSchemaValidator), the schema
   * must be cached via cacheSchema() before calling this method.
   *
   * For external validators, the schema is fetched from the remote service.
   *
   * @param a_schema_id        Schema ID to validate against.
   * @param a_metadata_format  Serialization format of the metadata ("json", "yaml").
   * @param a_metadata_content Metadata content to validate.
   * @param log_context        Logging/correlation context.
   * @return Validation result with valid flag and any errors/warnings.
   */
  virtual ValidationResult
  validateMetadata(const std::string &a_schema_id,
                   const std::string &a_metadata_format,
                   const std::string &a_metadata_content,
                   LogContext log_context) = 0;

  /**
   * @brief Check if this validator performs actual validation.
   *
   * Returns false for NullSchemaValidator (legacy/native path).
   * Callers can use this to skip validation calls or to inform users
   * that their schema engine doesn't support validation.
   *
   * @return true if validateDefinition/validateMetadata perform real checks.
   */
  virtual bool hasValidationCapability() const = 0;

  // ── Cache Management (Optional) ───────────────────────────────────────────
  //
  // These methods support validators that cache compiled schemas locally
  // (e.g., JsonSchemaValidator). External validators that store schemas
  // remotely can use the default no-op implementations.
  //
  // ClientWorker calls these methods when schemas are created/deleted.

  /**
   * @brief Cache a schema for subsequent metadata validation.
   *
   * For JsonSchemaValidator, this parses and compiles the schema into
   * an internal representation for fast repeated validation.
   *
   * For external validators, this is a no-op (schemas live remotely).
   *
   * @param a_schema_id Schema ID (used as cache key).
   * @param a_content   Schema content.
   * @param a_format    Serialization format ("json", "yaml").
   * @param log_context Logging context.
   * @return true if caching succeeded (or not needed), false on error.
   */
  virtual bool cacheSchema(const std::string &a_schema_id,
                           const std::string &a_content,
                           const std::string &a_format,
                           LogContext log_context) {
    (void)a_schema_id;
    (void)a_content;
    (void)a_format;
    (void)log_context;
    return true; // Default: no-op success
  }

  /**
   * @brief Remove a schema from the cache.
   *
   * Called when a schema is deleted or before re-caching an updated schema.
   *
   * @param a_schema_id Schema ID to evict.
   */
  virtual void evictSchema(const std::string &a_schema_id) {
    (void)a_schema_id; // Default: no-op
  }
};

} // namespace Core
} // namespace SDMS

#endif // ISCHEMAVALIDATOR_HPP
