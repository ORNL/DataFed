#ifndef EXTERNALSCHEMAVALIDATOR_HPP
#define EXTERNALSCHEMAVALIDATOR_HPP
#pragma once

#include "ISchemaValidator.hpp"
#include "SchemaAPIClient.hpp"

#include <memory>

namespace SDMS {
namespace Core {

/**
 * @brief Schema validator backed by the external Schema Management API.
 *
 * Validation is performed via REST calls to the external service.
 *
 * NOT thread-safe: each instance owns a SchemaAPIClient with its own
 * CURL handle. Create one instance per thread if concurrent access is needed.
 */
class ExternalSchemaValidator : public ISchemaValidator {
public:
  /**
   * @param a_client  The REST client. Must not be null or unconfigured.
   * @param a_engine  The engine this validator handles (e.g., "JSONSchema", "LinkML").
   *                  Passed to the API for validation context.
   */
  ExternalSchemaValidator(std::unique_ptr<SchemaAPIClient> a_client,
                          const std::string &a_engine);
  ~ExternalSchemaValidator() override = default;

  // Non-copyable
  ExternalSchemaValidator(const ExternalSchemaValidator &) = delete;
  ExternalSchemaValidator &operator=(const ExternalSchemaValidator &) = delete;

  ValidationResult validateDefinition(const std::string &a_schema_format,
                                      const std::string &a_content,
                                      LogContext log_context) override;

  ValidationResult validateMetadata(const std::string &a_schema_id,
                                    const std::string &a_metadata_format,
                                    const std::string &a_metadata_content,
                                    LogContext log_context) override;

  bool hasValidationCapability() const override { return true; }

  bool cacheSchema(const std::string &, const std::string &,
                 const std::string &, LogContext) override {
    return true;
  }

private:
  std::unique_ptr<SchemaAPIClient> m_client;
  std::string m_engine;
};

} // namespace Core
} // namespace SDMS

#endif
