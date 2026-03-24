#ifndef SCHEMAHANDLER_HPP
#define SCHEMAHANDLER_HPP
#pragma once

// Local public includes
#include "DatabaseAPI.hpp"
#include "common/DynaLog.hpp"

// Proto includes
#include "common/envelope.pb.h"

// Third party includes
#include <nlohmann/json.hpp>
#include <nlohmann/json-schema.hpp>

// Standard includes
#include <string>

namespace SDMS {
namespace Core {

/**
 * @brief Schema-related business logic, decoupled from messaging infrastructure.
 *
 * This class contains the validation and DB interaction logic that was
 * previously inline in ClientWorker's procSchemaCreate/Revise/Update and
 * procMetadataValidate methods. It depends only on DatabaseAPI (injected),
 * not on IMessage, ZeroMQ, PROC_MSG macros, or any messaging plumbing.
 *
 * ClientWorker's proc* methods become thin macro-wrapped calls:
 *
 *   PROC_MSG_BEGIN(SchemaCreateRequest, AckReply, log_context)
 *   m_schema_handler->handleCreate(a_uid, *request, reply, log_context);
 *   PROC_MSG_END(log_context)
 *
 * Testability:
 *   Construct with a DatabaseAPI pointed at a test DB (or a future mock).
 *   Call handle* methods directly with protobuf objects. No messaging
 *   infrastructure required.
 *
 * Thread safety:
 *   No shared mutable state. Each handle* call uses stack-local error
 *   accumulators. Multiple ClientWorker threads can share one SchemaHandler
 *   instance safely, provided DatabaseAPI calls are serialized per-instance
 *   (which they already are — each ClientWorker owns its own DatabaseAPI).
 */
class SchemaHandler {
public:
  explicit SchemaHandler(DatabaseAPI &a_db_client);

  // ── Schema Definition Mutations ───────────────────────────────────────

  /**
   * @brief Validate and create a new schema.
   *
   * Parses the definition, enforces DataFed requirements (type=object,
   * properties present), compiles the schema to verify it, then persists
   * via DatabaseAPI.
   *
   * @throws TraceException on validation failure or DB error.
   */
  void handleCreate(const std::string &a_uid,
                    const SchemaCreateRequest &a_request,
                    SchemaDataReply &a_reply,
                    LogContext log_context);

  /**
   * @brief Validate (if definition changed) and revise a schema.
   *
   * Only validates the definition if one is provided in the request.
   * Always forwards to DatabaseAPI::schemaRevise.
   */
  void handleRevise(const std::string &a_uid,
                    const SchemaReviseRequest &a_request,
                    SchemaDataReply &a_reply,
                    LogContext log_context);

  /**
   * @brief Validate (if definition changed) and update a schema in place.
   *
   * Only validates the definition if one is provided in the request.
   * Always forwards to DatabaseAPI::schemaUpdate.
   */
  void handleUpdate(const std::string &a_uid,
                    const SchemaUpdateRequest &a_request,
                    SchemaDataReply &a_reply,
                    LogContext log_context);

  // ── Metadata Validation ───────────────────────────────────────────────

  /**
   * @brief Validate metadata content against a stored schema.
   *
   * Loads the schema from DB, compiles it, validates the metadata.
   * Sets reply.errors if validation fails (does not throw on validation
   * failure — caller gets a reply with error details).
   *
   * @throws TraceException if the schema cannot be loaded from DB.
   */
  void handleMetadataValidate(const std::string &a_uid,
                              const MetadataValidateRequest &a_request,
                              MetadataValidateReply &a_reply,
                              LogContext log_context);

  void handleSearch(const std::string &a_uid,
                    const SchemaSearchRequest &a_request,
                    SchemaDataReply &a_reply,
                    LogContext log_context);

  void handleView(const std::string &a_uid,
                    const SchemaViewRequest &a_request,
                    SchemaDataReply &a_reply,
                    LogContext log_context);

  void handleDelete(const std::string &a_uid,
                    const SchemaDeleteRequest &a_request,
                    AckReply &a_reply,
                    LogContext log_context);

  // ── Utilities (public for direct unit testing) ────────────────────────

  /**
   * @brief Enforce DataFed-specific schema requirements.
   *
   * Checks that the schema is a JSON object with "type": "object" and
   * a "properties" field that is also a JSON object. These are requirements
   * beyond what JSON Schema itself mandates.
   *
   * Static so it can be tested without constructing a SchemaHandler.
   *
   * @throws TraceException if requirements are not met.
   */
  static void enforceRequiredProperties(const nlohmann::json &a_schema);

  /**
   * @brief Schema $ref loader callback.
   *
   * Called by nlohmann::json_schema::json_validator when it encounters a
   * $ref URI. Loads the referenced schema from the DB via schemaView.
   */
  void schemaLoader(const nlohmann::json_uri &a_uri,
                    nlohmann::json &a_value,
                    LogContext log_context);

private:
  /**
   * @brief Parse, enforce requirements, and compile a schema definition.
   *
   * This is the common validation sequence used by handleCreate, handleRevise,
   * and handleUpdate.
   *
   * @throws std::exception on parse failure, requirement violation, or
   *         compilation failure (including unresolvable $ref).
   */
  void validateSchemaDefinition(const std::string &a_def,
                                LogContext log_context);

  DatabaseAPI &m_db_client;
};

} // namespace Core
} // namespace SDMS

#endif
