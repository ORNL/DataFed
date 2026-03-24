#ifndef EXTERNALSCHEMASTORAGE_HPP
#define EXTERNALSCHEMASTORAGE_HPP
#pragma once
#include "ISchemaStorage.hpp"
#include "SchemaAPIClient.hpp"
#include <memory>
namespace SDMS {
namespace Core {
/**
 * @brief Schema storage backed by the external Schema Management API.
 *
 * Content is stored via REST calls to the external service.
 * Arango holds metadata with an empty `def` field.
 *
 * NOT thread-safe: each instance owns a SchemaAPIClient with its own
 * CURL handle. Create one instance per thread if concurrent access is needed.
 */
class ExternalSchemaStorage : public ISchemaStorage {
public:
  /**
   * @param a_client The REST client. Must not be null or unconfigured.
   *                 Caller may transfer ownership via unique_ptr.
   */
  explicit ExternalSchemaStorage(std::unique_ptr<SchemaAPIClient> a_client);
  ~ExternalSchemaStorage() override = default;
  // Non-copyable (owns unique_ptr)
  ExternalSchemaStorage(const ExternalSchemaStorage &) = delete;
  ExternalSchemaStorage &operator=(const ExternalSchemaStorage &) = delete;
  std::string storeContent(const std::string &a_id,
                           const std::string &a_content,
                           const std::string &a_desc,
                           const std::string &a_schema_format,
                           const std::string &a_engine,
                           const std::string &a_version,
                           LogContext log_context) override;
  StorageRetrieveResult retrieveContent(const std::string &a_id,
                                        const std::string &a_arango_def,
                                        LogContext log_context) override;
  std::string updateContent(const std::string &a_id,
                            const std::string &a_content,
                            const std::optional<std::string> &a_desc,
                            const std::optional<std::string> &a_schema_format,
                            const std::optional<std::string> &a_engine,
                            const std::optional<std::string> &a_version,
                            LogContext log_context) override;
  void deleteContent(const std::string &a_id,
                     LogContext log_context) override;
private:
  std::unique_ptr<SchemaAPIClient> m_client;
};
} // namespace Core
} // namespace SDMS
#endif
