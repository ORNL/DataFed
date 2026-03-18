// Local includes
#include "SchemaHandler.hpp"
#include "LocalJsonErrorHandler.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <functional>

using namespace std;

namespace SDMS {
namespace Core {

SchemaHandler::SchemaHandler(DatabaseAPI &a_db_client)
    : m_db_client(a_db_client) {}

// ── Static Utilities ────────────────────────────────────────────────────────

void SchemaHandler::enforceRequiredProperties(const nlohmann::json &a_schema) {
  // json_schema validator does not check for required fields in schema
  // Must include properties and type: Object
  if (!a_schema.is_object())
    EXCEPT(1, "Schema must be a JSON object.");

  nlohmann::json::const_iterator i = a_schema.find("properties");

  if (i == a_schema.end())
    EXCEPT(1, "Schema is missing required 'properties' field.");

  if (!i.value().is_object())
    EXCEPT(1, "Schema properties field must be a JSON object.");

  i = a_schema.find("type");

  if (i == a_schema.end())
    EXCEPT(1, "Schema is missing required 'type' field.");

  if (!i.value().is_string() || i.value().get<string>() != "object")
    EXCEPT(1, "Schema type must be 'object'.");
}

// ── Private ─────────────────────────────────────────────────────────────────

void SchemaHandler::validateSchemaDefinition(const std::string &a_def,
                                             LogContext log_context) {
  nlohmann::json schema = nlohmann::json::parse(a_def);

  enforceRequiredProperties(schema);

  nlohmann::json_schema::json_validator validator(
      bind(&SchemaHandler::schemaLoader, this, placeholders::_1,
           placeholders::_2, log_context));

  validator.set_root_schema(schema);
}

void SchemaHandler::schemaLoader(const nlohmann::json_uri &a_uri,
                                 nlohmann::json &a_value,
                                 LogContext log_context) {
  DL_DEBUG(log_context, "Load schema, scheme: "
                            << a_uri.scheme() << ", path: " << a_uri.path()
                            << ", auth: " << a_uri.authority()
                            << ", id: " << a_uri.identifier());

  libjson::Value sch;
  std::string id = a_uri.path();

  id = id.substr(1); // Skip leading "/"
  m_db_client.schemaView(id, sch, log_context);

  a_value = nlohmann::json::parse(
      sch.asArray().begin()->asObject().getValue("def").toString());

  DL_TRACE(log_context, "Loaded schema: " << a_value);
}

// ── Schema Definition Handlers ──────────────────────────────────────────────

void SchemaHandler::handleCreate(const std::string &a_uid,
                                 const SchemaCreateRequest &a_request,
                                 AckReply &a_reply,
                                 LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);

  DL_DEBUG(log_context, "Schema create");

  try {
    validateSchemaDefinition(a_request.def(), log_context);
    m_db_client.schemaCreate(a_request, log_context);
  } catch (exception &e) {
    DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
    EXCEPT_PARAM(1, "Invalid metadata schema: " << e.what());
  }
}

void SchemaHandler::handleRevise(const std::string &a_uid,
                                 const SchemaReviseRequest &a_request,
                                 AckReply &a_reply,
                                 LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);

  DL_DEBUG(log_context, "Schema revise");

  if (a_request.has_def()) {
    try {
      validateSchemaDefinition(a_request.def(), log_context);
    } catch (exception &e) {
      DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
      EXCEPT_PARAM(1, "Invalid metadata schema: " << e.what());
    }
  }

  m_db_client.schemaRevise(a_request, log_context);
}

void SchemaHandler::handleUpdate(const std::string &a_uid,
                                 const SchemaUpdateRequest &a_request,
                                 AckReply &a_reply,
                                 LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);

  DL_DEBUG(log_context, "Schema update");

  if (a_request.has_def()) {
    try {
      validateSchemaDefinition(a_request.def(), log_context);
    } catch (exception &e) {
      DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
      EXCEPT_PARAM(1, "Invalid metadata schema: " << e.what());
    }
  }

  m_db_client.schemaUpdate(a_request, log_context);
}

// ── Metadata Validation ─────────────────────────────────────────────────────

void SchemaHandler::handleMetadataValidate(
    const std::string &a_uid,
    const MetadataValidateRequest &a_request,
    MetadataValidateReply &a_reply,
    LogContext log_context) {

  DL_DEBUG(log_context, "Metadata validate");

  m_db_client.setClient(a_uid);

  // ── Load schema from DB ───────────────────────────────────────────────

  nlohmann::json schema;

  try {
    libjson::Value sch;
    DL_TRACE(log_context, "Schema " << a_request.sch_id());

    m_db_client.schemaView(a_request.sch_id(), sch, log_context);

    DL_TRACE(
        log_context,
        "Schema: "
            << sch.asArray().begin()->asObject().getValue("def").toString());

    schema = nlohmann::json::parse(
        sch.asArray().begin()->asObject().getValue("def").toString());
  } catch (TraceException &e) {
    DL_ERROR(log_context, "Schema validate failure: " << e.what());
    throw;
  } catch (exception &e) {
    EXCEPT_PARAM(1, "Schema parse error: " << e.what());
  }

  // ── Validate metadata against schema ──────────────────────────────────

  nlohmann::json_schema::json_validator validator(
      bind(&SchemaHandler::schemaLoader, this, placeholders::_1,
           placeholders::_2, log_context));

  // Stack-local error handler — no shared mutable state.
  // Replaces the old m_validator_err member on ClientWorker.
  LocalJsonErrorHandler handler;

  try {
    validator.set_root_schema(schema);

    nlohmann::json md = nlohmann::json::parse(a_request.metadata());

    validator.validate(md, handler);
  } catch (exception &e) {
    handler.appendError(
        string("Invalid metadata schema: ") + e.what() + "\n"
    );
    DL_ERROR(log_context, "Invalid metadata schema: " << e.what());
  }

  if (handler.hasErrors()) {
    a_reply.set_errors(handler.errors());
  }
}

} // namespace Core
} // namespace SDMS
