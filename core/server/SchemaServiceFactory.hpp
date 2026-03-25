#ifndef SCHEMASERVICEFACTORY_HPP
#define SCHEMASERVICEFACTORY_HPP
#pragma once

#include "ISchemaStorage.hpp"
#include "ISchemaValidator.hpp"

#include <memory>
#include <string>
#include <unordered_map>

namespace SDMS {
namespace Core {

/**
 * @brief Provides storage and validation services based on engine.
 *
 * Maintains separate registries for storage and validation, both keyed on
 * the `engine` field (e.g., "JSONSchema", "LinkML", "other"). This allows
 * independent routing — you could have:
 *   - JSONSchema stored externally, validated externally
 *   - LinkML stored externally, validated by a different service
 *   - XSD stored in S3, validated locally
 *
 * For most use cases, storage and validation share the same backend,
 * and you register both for the same engine values.
 *
 * Default providers handle unregistered engines (empty, "native", etc.).
 *
 * Thread safety: Registration is not thread-safe. Register all services at
 * startup before concurrent access. Lookups are thread-safe if registries
 * are not being modified.
 */
class SchemaServiceFactory {
public:
  SchemaServiceFactory() = default;
  ~SchemaServiceFactory() = default;

  // Non-copyable
  SchemaServiceFactory(const SchemaServiceFactory &) = delete;
  SchemaServiceFactory &operator=(const SchemaServiceFactory &) = delete;

  void setDefaultSchemaType(const std::string & a_engine);
  // ── Storage Registry ──────────────────────────────────────────────────

  void registerStorage(const std::string &a_engine,
                       std::shared_ptr<ISchemaStorage> a_storage);

  ISchemaStorage &getStorage(const std::string &a_engine);

  // ── Validator Registry ────────────────────────────────────────────────

  void registerValidator(const std::string &a_engine,
                         std::shared_ptr<ISchemaValidator> a_validator);

  ISchemaValidator &getValidator(const std::string &a_engine);

  // ── Convenience ───────────────────────────────────────────────────────

  /**
   * @brief Check if an engine has non-default storage registered.
   */
  bool hasCustomStorage(const std::string &a_engine) const;

  /**
   * @brief Check if an engine has non-default validator registered.
   */
  bool hasCustomValidator(const std::string &a_engine) const;

private:
  ISchemaStorage &resolveStorage(const std::string &a_engine) const;
  ISchemaValidator &resolveValidator(const std::string &a_engine) const;

  std::string m_default_engine;
  std::unordered_map<std::string, std::shared_ptr<ISchemaStorage>> m_storage;
  std::unordered_map<std::string, std::shared_ptr<ISchemaValidator>> m_validators;
};

} // namespace Core
} // namespace SDMS

#endif
