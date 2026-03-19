#include "ExternalSchemaValidator.hpp"
#include "common/TraceException.hpp"
#include "common/envelope.pb.h"

namespace SDMS {
namespace Core {

ExternalSchemaValidator::ExternalSchemaValidator(
    std::unique_ptr<SchemaAPIClient> a_client,
    const std::string &a_engine)
    : m_client(std::move(a_client)), m_engine(a_engine) {
  if (!m_client)
    EXCEPT(INTERNAL_ERROR, "ExternalSchemaValidator: null client");
  if (!m_client->isConfigured())
    EXCEPT(INTERNAL_ERROR,
           "ExternalSchemaValidator: client not configured (empty base URL)");
  if (m_engine.empty())
    EXCEPT(INTERNAL_ERROR,
           "ExternalSchemaValidator: engine must be specified");
}

ValidationResult
ExternalSchemaValidator::validateDefinition(const std::string &a_schema_format,
                                            const std::string &a_content,
                                            LogContext log_context) {
  std::string errors;
  bool valid = m_client->validateSchema(a_schema_format, m_engine,
                                        a_content, errors, log_context);

  if (valid)
    return ValidationResult::Ok();
  return ValidationResult::Fail(errors);
}

ValidationResult
ExternalSchemaValidator::validateMetadata(const std::string &a_schema_id,
                                          const std::string &a_metadata_format,
                                          const std::string &a_metadata_content,
                                          LogContext log_context) {
  std::string errors, warnings;
  bool valid = m_client->validateMetadata(a_schema_id, a_metadata_format,
                                          m_engine, a_metadata_content,
                                          errors, warnings, log_context);

  if (valid)
    return ValidationResult::Ok(warnings);
  return ValidationResult::Fail(errors);
}

} // namespace Core
} // namespace SDMS
