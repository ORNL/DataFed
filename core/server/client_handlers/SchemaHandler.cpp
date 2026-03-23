// Local includes
#include "SchemaHandler.hpp"
#include "LocalJsonErrorHandler.hpp"
#include "common/TraceException.hpp"
#include "schema_storage/ArangoSchemaStorage.hpp"
#include "schema_validator/JsonSchemaValidator.hpp"

// Standard includes
#include <functional>

using namespace std;

namespace SDMS {
namespace Core {

SchemaHandler::SchemaHandler(DatabaseAPI &a_db_client)
    : m_db_client(a_db_client) {
    // Assumes that we have already placed the schema in the database, arango
    // storage is a shell to be consistent with the interface.
    auto arango_storage = std::make_shared<ArangoSchemaStorage>();
    m_schema_factory.registerStorage("json-schema", std::move(arango_storage));
    auto json_schema_validator = std::make_shared<JsonSchemaValidator>();
    m_schema_factory.registerValidator("json-schema", std::move(json_schema_validator));
}

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
                                 SchemaDataReply &a_reply,
                                 LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);
  DL_DEBUG(log_context, "Schema create");

  // Validate schema definition through factory
  try {
    auto &validator = m_schema_factory.getValidator(a_request.type());
    auto result = validator.validateDefinition(
        a_request.format(), a_request.def(), log_context);

    if (!result.valid) {
      DL_ERROR(log_context, "Invalid metadata schema: " << result.errors);
      EXCEPT_PARAM(1, "Invalid metadata schema: " << result.errors);
    }
  } catch (TraceException &) {
    throw;
  } catch (exception &e) {
    DL_ERROR(log_context, "Schema validation failed: " << e.what());
    EXCEPT_PARAM(1, "Schema validation failed: " << e.what());
  }

  // Persist to Arango — exception propagates naturally on failure
  m_db_client.schemaCreate(a_request, a_reply, log_context);

  // Store content through factory (no-op for Arango, meaningful for external)
  try {
    m_schema_factory.getStorage(a_request.type()).storeContent(
        a_reply.id(), a_request.def(), a_request.desc(), log_context);
  } catch (exception &e) {
    DL_ERROR(log_context, "Schema storage failed attempting rollback: " << e.what());
    try {
      AckReply a_reply_delete;
      m_db_client.schemaDelete(a_reply.id(), a_reply_delete, log_context);
    } catch (exception &e) {
      DL_ERROR(log_context, "Schema rollback of create request failed: " << e.what());
    }
    EXCEPT_PARAM(1, "Schema storage failed: " << e.what());
  }
}

void SchemaHandler::handleRevise(const std::string &a_uid,
                                 const SchemaReviseRequest &a_request,
                                 SchemaDataReply &a_reply,
                                 LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);
  DL_DEBUG(log_context, "Schema revise");
 
  // Method-scoped so storage block can see them
  std::string schema_type = "json-schema";
  std::string schema_format = "json";
 
  if (a_request.has_def()) {
    // Look up existing schema to determine type/format for validation
    try {
      libjson::Value sch;
      // NOTE: verify this is the correct field — might be id() not sch_id()
      m_db_client.schemaView(a_request.id(), sch, log_context);
      schema_type =
          sch.asArray().begin()->asObject().getValue("type").toString();
      schema_format =
          sch.asArray().begin()->asObject().getValue("format").toString();
    } catch (exception &e) {
      DL_WARN(log_context,
              "Could not look up schema " << a_request.id()
                  << " for type/format, defaulting to json-schema/json: "
                  << e.what());
      schema_type = "json-schema";
      schema_format = "json";
    }
 
    // Validate new definition
    try {
      auto &validator = m_schema_factory.getValidator(schema_type);
      auto result = validator.validateDefinition(
          schema_format, a_request.def(), log_context);
 
      if (!result.valid) {
        DL_ERROR(log_context, "Invalid metadata schema: " << result.errors);
        EXCEPT_PARAM(1, "Invalid metadata schema: " << result.errors);
      }
    } catch (TraceException &) {
      throw;
    } catch (exception &e) {
      DL_ERROR(log_context, "Schema validation failed: " << e.what());
      EXCEPT_PARAM(1, "Schema validation failed: " << e.what());
    }
  }
 
  // Create new revision in Arango
  m_db_client.schemaRevise(a_request, a_reply, log_context);
 
  // Store content for new revision only when def was provided
  if (a_request.has_def()) {
    try {
      m_schema_factory.getStorage(schema_type).storeContent(
          a_reply.id(), a_request.def(), a_request.desc(), log_context);
    } catch (exception &e) {
      // TODO: Arango revision exists but external storage failed — needs rollback
      DL_ERROR(log_context,
               "Schema storage failed for revision: " << e.what());
      EXCEPT_PARAM(1, "Schema storage failed for revision: " << e.what());
    }
  }
}

void SchemaHandler::handleUpdate(const std::string &a_uid,
                                 const SchemaUpdateRequest &a_request,
                                 SchemaDataReply &a_reply,
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

void SchemaHandler::handleSearch(const std::string &a_uid,
                                 const SchemaSearchRequest &a_request,
                                 SchemaDataReply &a_reply,
                                 LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);
  DL_DEBUG(log_context, "Schema search");
  m_db_client.schemaSearch(a_request, a_reply, log_context);
}

void SchemaHandler::handleView(const std::string &a_uid,
                                 const SchemaViewRequest &a_request,
                                 SchemaDataReply &a_reply,
                                 LogContext log_context) {

  (void)a_reply;
  m_db_client.setClient(a_uid);
  DL_DEBUG(log_context, "Schema view");
  m_db_client.schemaView(a_request, a_reply, log_context);
}

void SchemaHandler::handleDelete(const std::string &a_uid,
                                 const SchemaDeleteRequest &a_request,
                                 AckReply &a_reply,
                                 LogContext log_context) {

  (void)a_reply;
  m_db_client.setClient(a_uid);
  DL_DEBUG(log_context, "Schema delete");
  m_db_client.schemaDelete(a_request, a_reply, log_context);
}


} // namespace Core
} // namespace SDMS
