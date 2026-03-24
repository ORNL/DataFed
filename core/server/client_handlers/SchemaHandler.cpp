// Local includes
#include "SchemaHandler.hpp"
#include "LocalJsonErrorHandler.hpp"
#include "common/TraceException.hpp"
#include "schema_storage/ArangoSchemaStorage.hpp"
#include "schema_validators/JsonSchemaValidator.hpp"

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

    auto json_schema_validator = std::make_shared<JsonSchemaValidator>(
        [this](const std::string &a_id, LogContext log_context)
            -> nlohmann::json {
          libjson::Value sch;
          m_db_client.schemaView(a_id, sch, log_context);
          return nlohmann::json::parse(
              sch.asArray().begin()->asObject().getValue("def").toString());
        });

    m_schema_factory.registerValidator("json-schema",
                                       std::move(json_schema_validator));
    m_schema_factory.setDefaultSchemaType("json-schema");
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
        a_reply.schema(0).id(), a_request.def(), a_request.desc(), log_context);
  } catch (exception &e) {
    DL_ERROR(log_context, "Schema storage failed attempting rollback: " << e.what());
    try {
      AckReply a_reply_delete;
      SchemaDeleteRequest delete_request;
      delete_request.set_id(a_reply.schema(0).id());
      m_db_client.schemaDelete(delete_request, a_reply_delete, log_context);
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
          sch.asArray().begin()->asObject().getString("type");
      schema_format =
          sch.asArray().begin()->asObject().getString("format");
    } catch (exception &e) {
      DL_WARNING(log_context,
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
          a_reply.schema(0).id(), a_request.def(), a_request.desc(), log_context);
    } catch (exception &e) {
      // TODO: Arango revision exists but external storage failed — needs rollback
      DL_ERROR(log_context,
               "Schema storage failed for revision: " << e.what());
      try {
        AckReply a_reply_delete;
        SchemaDeleteRequest delete_request;
        delete_request.set_id(a_reply.schema(0).id());
        m_db_client.schemaDelete(delete_request, a_reply_delete, log_context);
      } catch (exception &e) {
        DL_ERROR(log_context, "Schema rollback of revision request failed: " << e.what());
      }
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

  std::string schema_type = "json-schema";
  std::string schema_format = "json";

  // Get current state of the schema document
  libjson::Value sch;

  if (a_request.has_def()) {
    // Look up existing schema to determine type/format
    try {
      m_db_client.schemaView(a_request.id(), sch, log_context);
      schema_type =
          sch.asArray().begin()->asObject().getString("type");
      schema_format =
          sch.asArray().begin()->asObject().getString("format");
    } catch (exception &e) {
      DL_WARNING(log_context,
              "Could not look up schema " << a_request.id()
                  << " for type/format, defaulting to json-schema/json: "
                  << e.what());
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

  // Update in-place in Arango
  m_db_client.schemaUpdate(a_request, log_context);

  // Update content in external storage only when def was provided.
  // Uses updateContent (in-place) rather than storeContent (new entry).
  if (a_request.has_def()) {
    try {
      // NOTE: if SchemaUpdateRequest doesn't have has_desc(), just pass
      // std::nullopt unconditionally and let Arango be the source of truth
      // for description.
      std::optional<std::string> desc = std::nullopt;
      if (a_request.has_desc()) {
        desc = a_request.desc();
      }

      m_schema_factory.getStorage(schema_type).updateContent(
          a_request.id(), a_request.def(), desc, log_context);
    } catch (exception &e) {

      SchemaUpdateRequest rollback_request;
      auto & sch_doc = sch.asArray().begin()->asObject();
      rollback_request.set_id(sch_doc.getString("id"));
      rollback_request.set_desc(sch_doc.getString("desc"));
      rollback_request.set_pub(sch_doc.getBool("pub"));
      rollback_request.set_sys(sch_doc.getBool("sys"));

      DL_ERROR(log_context,
               "Schema storage update failed attempting rollback: " << e.what());
      try {
        m_db_client.schemaUpdate(rollback_request, log_context);
      } catch (exception &e) {
        DL_ERROR(log_context,
               "Schema storage update rollback failed: " << e.what());

      }
      EXCEPT_PARAM(1, "Schema storage update failed: " << e.what());
    }
  }
}

// ── Metadata Validation ─────────────────────────────────────────────────────

std::string SchemaHandler::validateMetadataContent(
    const std::string &a_sch_id,
    const std::string &a_metadata,
    LogContext log_context) {

  DL_DEBUG(log_context, "validateMetadataContent schema=" << a_sch_id);

  std::string schema_type = "json-schema";
  std::string schema_format = "json";
  std::string schema_def;

  // Load schema record from DB
  try {
    libjson::Value sch;
    m_db_client.schemaView(a_sch_id, sch, log_context);

    auto &sch_doc = sch.asArray().begin()->asObject();
    schema_def = sch_doc.getValue("def").toString();

    try {
      schema_type = sch_doc.getString("type");
      schema_format = sch_doc.getString("format");
    } catch (std::exception &) {
      DL_WARNING(log_context,
              "Schema " << a_sch_id
                  << " missing type/format fields, defaulting to "
                     "json-schema/json");
    }
  } catch (std::exception &e) {
    return std::string("Metadata schema error: ") + e.what() + "\n";
  }

  // Retrieve content from storage backend
  try {
    auto &storage = m_schema_factory.getStorage(schema_type);
    auto storage_result = storage.retrieveContent(
        a_sch_id, schema_def, log_context);
    if (!storage_result.Ok) {
      return "Failed to retrieve schema content: " + storage_result.error + "\n";
    }
    schema_def = storage_result.content;
  } catch (std::exception &e) {
    return std::string("Schema storage error: ") + e.what() + "\n";
  }

  // Cache and validate
  try {
    auto &validator = m_schema_factory.getValidator(schema_type);

    if (!validator.cacheSchema(a_sch_id, schema_def,
                               schema_format, log_context)) {
      return "Failed to compile schema: " + a_sch_id + "\n";
    }

    auto result = validator.validateMetadata(
        a_sch_id, schema_format, a_metadata, log_context);

    if (!result.valid) {
      return result.errors;
    }
  } catch (std::exception &e) {
    return std::string("Metadata validation error: ") + e.what() + "\n";
  }

  return "";
}

void SchemaHandler::handleMetadataValidate(
    const std::string &a_uid,
    const MetadataValidateRequest &a_request,
    MetadataValidateReply &a_reply,
    LogContext log_context) {

  DL_DEBUG(log_context, "Metadata validate");
  m_db_client.setClient(a_uid);

  std::string errors = validateMetadataContent(
      a_request.sch_id(), a_request.metadata(), log_context);

  if (!errors.empty()) {
    a_reply.set_errors(errors);
  }
}

void SchemaHandler::handleView(const std::string &a_uid,
                                const SchemaViewRequest &a_request,
                                SchemaDataReply &a_reply,
                                LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);
  DL_DEBUG(log_context, "Schema view");

  m_db_client.schemaView(a_request, a_reply, log_context);

  // Hydrate def field from storage backend for each record in the reply.
  // For Arango-native schemas this is a no-op passthrough.
  // For external backends, the Arango def field may be a reference/stub
  // that retrieveContent resolves to the actual content.
  //
  // NOTE: Assumes SchemaDataReply has a repeated SchemaData field accessible
  // via data() / mutable_data(). Adjust accessor names to match your proto.
  for (int i = 0; i < a_reply.schema_size(); ++i) {
    auto *record = a_reply.mutable_schema(i);

    std::string schema_type = "json-schema";
    try {
      if (!record->type().empty()) {
        schema_type = record->type();
      }
    } catch (exception &) {
      // Fall through to default
    }

    try {
      auto &storage = m_schema_factory.getStorage(schema_type);
      auto result = storage.retrieveContent(
          record->id(), record->def(), log_context);

      if (result.Ok) {
        record->set_def(result.content);
      } else {
        DL_WARNING(log_context,
                "Failed to retrieve content for schema "
                    << record->id() << ": " << result.error
                    << ". Returning Arango def as-is.");
      }
    } catch (exception &e) {
      DL_WARNING(log_context,
              "Storage retrieval failed for schema "
                  << record->id() << ": " << e.what()
                  << ". Returning Arango def as-is.");
    }
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

  for (int i = 0; i < a_reply.schema_size(); ++i) {
    auto *record = a_reply.mutable_schema(i);

    std::string schema_type = "json-schema";
    try {
      if (!record->type().empty()) {
        schema_type = record->type();
      }
    } catch (exception &) {
      // Fall through to default
    }

    try {
      auto &storage = m_schema_factory.getStorage(schema_type);
      auto result = storage.retrieveContent(
          record->id(), record->def(), log_context);

      if (result.Ok) {
        record->set_def(result.content);
      } else {
        DL_WARNING(log_context,
                "Failed to retrieve content for schema "
                    << record->id() << ": " << result.error
                    << ". Returning Arango def as-is.");
      }
    } catch (exception &e) {
      DL_WARNING(log_context,
              "Storage retrieval failed for schema "
                  << record->id() << ": " << e.what()
                  << ". Returning Arango def as-is.");
    }
  }
}

void SchemaHandler::handleDelete(const std::string &a_uid,
                                  const SchemaDeleteRequest &a_request,
                                  AckReply &a_reply,
                                  LogContext log_context) {
  (void)a_reply;
  m_db_client.setClient(a_uid);
  DL_DEBUG(log_context, "Schema delete");

  // Look up type BEFORE deleting from Arango — we need it for
  // external storage cleanup and it won't exist after deletion.
  std::string schema_type = "json-schema";
  try {
    libjson::Value sch;
    m_db_client.schemaView(a_request.id(), sch, log_context);

    auto &sch_doc = sch.asArray().begin()->asObject();
    schema_type = sch_doc.getString("type");
  } catch (exception &e) {
    DL_WARNING(log_context,
            "Could not look up schema " << a_request.id()
                << " type before deletion, defaulting to json-schema: "
                << e.what());
  }

  // Delete from Arango first — this is the source of truth
  m_db_client.schemaDelete(a_request, a_reply, log_context);

  // Clean up external storage. For Arango-native this is a no-op.
  // Runs after Arango deletion so we don't orphan external content
  // if the Arango delete fails.
  try {
    m_schema_factory.getStorage(schema_type).deleteContent(
        a_request.id(), log_context);
  } catch (exception &e) {
    // Log but don't fail the request — Arango record is already gone.
    // Orphaned external content is preferable to a failed delete that
    // leaves the Arango record inconsistent.
    DL_ERROR(log_context,
             "External storage cleanup failed for deleted schema "
                 << a_request.id() << ": " << e.what());
  }
}


} // namespace Core
} // namespace SDMS
