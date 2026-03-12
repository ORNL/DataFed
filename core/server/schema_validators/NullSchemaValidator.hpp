#ifndef NULLSCHEMAVALIDATOR_HPP
#define NULLSCHEMAVALIDATOR_HPP
#pragma once

#include "ISchemaValidator.hpp"

namespace SDMS {
namespace Core {

/**
 * @brief No-op validator for native/legacy schemas.
 *
 * Always returns Ok() — no validation capability.
 * Used for schemas stored directly in Arango without external validation.
 *
 * Thread-safe (stateless).
 */
class NullSchemaValidator : public ISchemaValidator {
public:
  NullSchemaValidator() = default;
  ~NullSchemaValidator() override = default;

  ValidationResult validateDefinition(const std::string &a_schema_format,
                                      const std::string &a_content,
                                      LogContext log_context) override {
    (void)a_schema_format;
    (void)a_content;
    (void)log_context;
    return ValidationResult::Ok();
  }

  ValidationResult validateMetadata(const std::string &a_schema_id,
                                    const std::string &a_metadata_format,
                                    const std::string &a_metadata_content,
                                    LogContext log_context) override {
    (void)a_schema_id;
    (void)a_metadata_format;
    (void)a_metadata_content;
    (void)log_context;
    return ValidationResult::Ok();
  }

  bool hasValidationCapability() const override { return false; }
};

} // namespace Core
} // namespace SDMS

#endif
