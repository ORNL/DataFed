#ifndef ISCHEMASTORAGE_HPP
#define ISCHEMASTORAGE_HPP
#pragma once

#include "common/DynaLog.hpp"

#include <optional>
#include <string>

namespace SDMS {
namespace Core {

/**
 * @brief Result of a content retrieval operation.
 *
 * Distinguishes between "content is empty" and "storage is unreachable."
 */
struct StorageRetrieveResult {
  bool success;          ///< True if storage was reachable and content retrieved
  std::string content;   ///< The schema definition (empty string if none)
  std::string error;     ///< Error message if success is false

  static StorageRetrieveResult Ok(const std::string &a_content) {
    return {true, a_content, ""};
  }

  static StorageRetrieveResult Fail(const std::string &a_error) {
    return {false, "", a_error};
  }
};

/**
 * @brief Interface for schema content storage.
 *
 * This abstraction handles WHERE schema definition content lives:
 * - Arango's `def` field (native)
 * - External REST API
 * - S3, git, etc. (future)
 *
 * Validation is handled separately by ISchemaValidator.
 *
 * Key contract:
 *   - storeContent/updateContent return the value to write into Arango's
 *     `def` field. For native storage this IS the content; for external
 *     storage this is typically "".
 *   - retrieveContent returns a result struct that explicitly indicates
 *     success/failure. Callers must check `success` before using `content`.
 *   - Implementations must be thread-safe OR documented as requiring
 *     one instance per thread.
 */
class ISchemaStorage {
public:
  virtual ~ISchemaStorage() = default;

  /**
   * @brief Store schema content on create.
   *
   * @param a_id            Schema ID (matches Arango document ID).
   * @param a_content       The raw schema definition text.
   * @param a_desc          Human-readable description (storage may use this).
   * @param a_schema_format Serialization format ("json", "yaml", "xml").
   * @param a_engine        Validation engine / schema type ("JSONSchema",
   *                        "LinkML", etc.).
   * @param a_version       Semantic version string (empty if not versioned).
   * @param log_context     Logging/correlation context.
   * @return The value to write into Arango's `def` field.
   * @throws TraceException on failure.
   */
  virtual std::string storeContent(const std::string &a_id,
                                   const std::string &a_content,
                                   const std::string &a_desc,
                                   const std::string &a_schema_format,
                                   const std::string &a_engine,
                                   const std::string &a_version,
                                   LogContext log_context) = 0;

  /**
   * @brief Retrieve schema content.
   *
   * @param a_id         Schema ID.
   * @param a_arango_def The `def` field from Arango (used by native storage).
   * @param log_context  Logging/correlation context.
   * @return Result struct with success flag, content, and error message.
   *         NEVER throws for unreachable storage — returns Fail() instead.
   */
  virtual StorageRetrieveResult retrieveContent(const std::string &a_id,
                                                const std::string &a_arango_def,
                                                LogContext log_context) = 0;

  /**
   * @brief Update schema content.
   *
   * @param a_id            Schema ID.
   * @param a_content       New schema definition text.
   * @param a_desc          Updated description (nullopt if unchanged).
   * @param a_schema_format Updated format (nullopt if unchanged).
   * @param a_engine        Updated engine (nullopt if unchanged).
   * @param a_version       Updated version (nullopt if unchanged).
   * @param log_context     Logging/correlation context.
   * @return The value to write into Arango's `def` field.
   * @throws TraceException on failure.
   */
  virtual std::string updateContent(const std::string &a_id,
                                    const std::string &a_content,
                                    const std::optional<std::string> &a_desc,
                                    const std::optional<std::string> &a_schema_format,
                                    const std::optional<std::string> &a_engine,
                                    const std::optional<std::string> &a_version,
                                    LogContext log_context) = 0;

  /**
   * @brief Delete content for a schema being removed.
   *
   * For external storage, this cleans up the remote content.
   * For native storage, this is a no-op (Arango deletion handles it).
   *
   * Implementations should log failures but may choose not to throw
   * (orphaned remote content is acceptable per design decision).
   *
   * @param a_id        Schema ID.
   * @param log_context Logging/correlation context.
   */
  virtual void deleteContent(const std::string &a_id,
                             LogContext log_context) = 0;
};

} // namespace Core
} // namespace SDMS

#endif
