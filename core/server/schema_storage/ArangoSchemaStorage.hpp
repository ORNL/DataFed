#ifndef ARANGOSCHEMASTORAGE_HPP
#define ARANGOSCHEMASTORAGE_HPP
#pragma once
#include "ISchemaStorage.hpp"
namespace SDMS {
namespace Core {
/**
 * @brief Native Arango-only schema storage.
 *
 * Passthrough implementation: content lives in Arango's `def` field.
 * All methods are trivial because DatabaseAPI's Arango CRUD handles everything.
 *
 * The schema_format, engine, and version parameters are ignored — Arango
 * stores these as separate document fields managed by DatabaseAPI, not
 * by the storage layer.
 *
 * Thread-safe (stateless).
 */
class ArangoSchemaStorage : public ISchemaStorage {
public:
  ArangoSchemaStorage() = default;
  ~ArangoSchemaStorage() override = default;
  std::string storeContent(const std::string &a_id,
                           const std::string &a_content,
                           const std::string &a_desc,
                           const std::string &a_schema_format,
                           const std::string &a_engine,
                           const std::string &a_version,
                           LogContext log_context) override {
    (void)a_id;
    (void)a_desc;
    (void)a_schema_format;
    (void)a_engine;
    (void)a_version;
    (void)log_context;
    return a_content; // Content goes directly into Arango's def field
  }
  StorageRetrieveResult retrieveContent(const std::string &a_id,
                                        const std::string &a_arango_def,
                                        LogContext log_context) override {
    (void)a_id;
    (void)log_context;
    return StorageRetrieveResult::Ok(a_arango_def); // Content IS in Arango
  }
  std::string updateContent(const std::string &a_id,
                            const std::string &a_content,
                            const std::optional<std::string> &a_desc,
                            const std::optional<std::string> &a_schema_format,
                            const std::optional<std::string> &a_engine,
                            const std::optional<std::string> &a_version,
                            LogContext log_context) override {
    (void)a_id;
    (void)a_desc;
    (void)a_schema_format;
    (void)a_engine;
    (void)a_version;
    (void)log_context;
    return a_content;
  }
  void deleteContent(const std::string &a_id,
                     LogContext log_context) override {
    (void)a_id;
    (void)log_context;
    // No-op — Arango document deletion handles it
  }
};
} // namespace Core
} // namespace SDMS
#endif
