#include "ExternalSchemaStorage.hpp"
#include "common/TraceException.hpp"
#include "common/envelope.pb.h"

namespace SDMS {
namespace Core {

ExternalSchemaStorage::ExternalSchemaStorage(
    std::unique_ptr<SchemaAPIClient> a_client)
    : m_client(std::move(a_client)) {
  if (!m_client)
    EXCEPT(INTERNAL_ERROR, "ExternalSchemaStorage: null client");
  if (!m_client->isConfigured())
    EXCEPT(INTERNAL_ERROR,
           "ExternalSchemaStorage: client not configured (empty base URL)");
}

std::string ExternalSchemaStorage::storeContent(const std::string &a_id,
                                                const std::string &a_content,
                                                const std::string &a_desc,
                                                LogContext log_context) {
  // Use PUT to enforce the same ID in both Arango and the API
  m_client->putSchema(a_id,
                      a_id, // name = id (convention)
                      a_desc, a_content, log_context);

  return ""; // Arango def is empty — content lives in the API
}

StorageRetrieveResult
ExternalSchemaStorage::retrieveContent(const std::string &a_id,
                                       const std::string &a_arango_def,
                                       LogContext log_context) {
  (void)a_arango_def; // Ignored — we fetch from the API

  try {
    auto result = m_client->getSchema(a_id, log_context);

    if (result.contains("content"))
      return StorageRetrieveResult::Ok(result["content"].get<std::string>());

    // API returned but no content field — treat as empty content, not error
    DL_WARNING(log_context,
               "ExternalSchemaStorage: API returned no content field for "
                   << a_id);
    return StorageRetrieveResult::Ok("");

  } catch (TraceException &e) {
    // Storage unreachable — return explicit failure, don't hide it
    DL_ERROR(log_context,
             "ExternalSchemaStorage: failed to retrieve content for "
                 << a_id << ": " << e.toString());
    return StorageRetrieveResult::Fail(
        "Schema storage service unavailable: " + e.toString());
  }
}

std::string ExternalSchemaStorage::updateContent(
    const std::string &a_id, const std::string &a_content,
    const std::optional<std::string> &a_desc, LogContext log_context) {

  m_client->patchSchema(a_id,
                        std::nullopt, // name unchanged
                        a_desc, a_content, log_context);

  return ""; // Arango def stays empty
}

void ExternalSchemaStorage::deleteContent(const std::string &a_id,
                                          LogContext log_context) {
  try {
    m_client->deleteSchema(a_id, log_context);
  } catch (TraceException &e) {
    // Log but don't throw — orphaned content is acceptable per design decision
    DL_WARNING(log_context,
               "ExternalSchemaStorage: failed to delete content for "
                   << a_id << " (orphaned content may remain): " << e.toString());
  }
}

} // namespace Core
} // namespace SDMS
