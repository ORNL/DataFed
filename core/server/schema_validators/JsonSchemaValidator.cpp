// Local includes
#include "JsonSchemaValidator.hpp"
#include "LocalJsonErrorHandler.hpp"
#include "common/DynaLog.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <sstream>

namespace SDMS {
namespace Core {

// ── Constructor ─────────────────────────────────────────────────────────────

JsonSchemaValidator::JsonSchemaValidator(SchemaLoaderCallback a_loader)
    : m_loader(std::move(a_loader)) {}

// ── Schema Loader ───────────────────────────────────────────────────────────

void JsonSchemaValidator::setSchemaLoader(SchemaLoaderCallback a_loader) {
  std::lock_guard<std::mutex> lock(m_loader_mutex);
  m_loader = std::move(a_loader);
}

void JsonSchemaValidator::schemaLoaderAdapter(const nlohmann::json_uri &a_uri,
                                              nlohmann::json &a_value) {
  // Extract schema ID from URI path (skip leading "/")
  // This matches the existing ClientWorker::schemaLoader behavior
  std::string id = a_uri.path();
  if (!id.empty() && id[0] == '/') {
    id = id.substr(1);
  }

  // m_loader_mutex must be held by caller (compileSchema)
  DL_DEBUG(m_current_log_context,
           "JsonSchemaValidator loading schema ref: " << id
               << " (scheme=" << a_uri.scheme() << ", path=" << a_uri.path()
               << ")");

  if (!m_loader) {
    throw std::runtime_error("Schema $ref resolution failed: no loader "
                             "configured for schema ID: " + id);
  }

  a_value = m_loader(id, m_current_log_context);

  DL_TRACE(m_current_log_context, "Loaded referenced schema: " << a_value);
}

// ── DataFed Requirements ────────────────────────────────────────────────────

void JsonSchemaValidator::enforceDataFedRequirements(
    const nlohmann::json &a_schema) {
  // Extracted from ClientWorker::schemaEnforceRequiredProperties()
  // json_schema validator does not check for required fields in schema
  // Must include properties and type: object

  if (!a_schema.is_object()) {
    throw std::runtime_error("Schema must be a JSON object.");
  }

  auto props_it = a_schema.find("properties");
  if (props_it == a_schema.end()) {
    throw std::runtime_error("Schema is missing required 'properties' field.");
  }
  if (!props_it.value().is_object()) {
    throw std::runtime_error("Schema properties field must be a JSON object.");
  }

  auto type_it = a_schema.find("type");
  if (type_it == a_schema.end()) {
    throw std::runtime_error("Schema is missing required 'type' field.");
  }
  if (!type_it.value().is_string() || 
      type_it.value().get<std::string>() != "object") {
    throw std::runtime_error("Schema type must be 'object'.");
  }
}

// ── Schema Compilation ──────────────────────────────────────────────────────

std::shared_ptr<nlohmann::json_schema::json_validator>
JsonSchemaValidator::compileSchema(const nlohmann::json &a_schema,
                                   LogContext log_context) {
  // Lock to protect m_current_log_context and m_loader during compilation
  // (schemaLoaderAdapter callback may be invoked during set_root_schema)
  std::lock_guard<std::mutex> lock(m_loader_mutex);
  
  // Store log context for the loader callback
  m_current_log_context = log_context;

  // Create validator with schema loader (matches ClientWorker pattern)
  auto validator = std::make_shared<nlohmann::json_schema::json_validator>(
      std::bind(&JsonSchemaValidator::schemaLoaderAdapter, this,
                std::placeholders::_1, std::placeholders::_2));

  // This validates the schema itself and compiles it
  validator->set_root_schema(a_schema);

  return validator;
}

// ── Definition Validation ───────────────────────────────────────────────────

ValidationResult
JsonSchemaValidator::validateDefinition(const std::string &a_schema_format,
                                        const std::string &a_content,
                                        LogContext log_context) {
  DL_DEBUG(log_context, "JsonSchemaValidator::validateDefinition format="
                            << a_schema_format
                            << " content_len=" << a_content.size());

  if (a_content.empty()) {
    return ValidationResult::Fail("Schema content is empty");
  }

  // Currently only JSON is supported (matches existing DataFed behavior)
  if (!a_schema_format.empty() && a_schema_format != "json") {
    return ValidationResult::Fail(
        "Unsupported schema format: " + a_schema_format + 
        ". Only 'json' is currently supported.");
  }

  try {
    // Step 1: Parse JSON
    nlohmann::json schema = nlohmann::json::parse(a_content);

    // Step 2: Enforce DataFed-specific requirements
    // (extracted from ClientWorker::schemaEnforceRequiredProperties)
    enforceDataFedRequirements(schema);

    // Step 3: Compile schema (validates JSON Schema syntax)
    // This matches the pattern in procSchemaCreateRequest
    compileSchema(schema, log_context);

    DL_DEBUG(log_context, "Schema definition validated successfully");
    return ValidationResult::Ok();

  } catch (const nlohmann::json::parse_error &e) {
    std::string error = "JSON parse error: ";
    error += e.what();
    DL_DEBUG(log_context, "Schema validation failed: " << error);
    return ValidationResult::Fail(error);

  } catch (const std::exception &e) {
    // Covers schema compilation errors, DataFed requirement errors, etc.
    std::string error = "Invalid metadata schema: ";
    error += e.what();
    DL_DEBUG(log_context, "Schema validation failed: " << error);
    return ValidationResult::Fail(error);
  }
}

// ── Metadata Validation ─────────────────────────────────────────────────────

ValidationResult
JsonSchemaValidator::validateMetadata(const std::string &a_schema_id,
                                      const std::string &a_metadata_format,
                                      const std::string &a_metadata_content,
                                      LogContext log_context) {
  DL_DEBUG(log_context, "JsonSchemaValidator::validateMetadata schema_id="
                            << a_schema_id << " format=" << a_metadata_format
                            << " content_len=" << a_metadata_content.size());

  if (a_metadata_content.empty()) {
    return ValidationResult::Fail("Metadata content is empty");
  }

  if (!a_metadata_format.empty() && a_metadata_format != "json") {
    return ValidationResult::Fail(
        "Unsupported metadata format: " + a_metadata_format + 
        ". Only 'json' is currently supported.");
  }

  // Look up cached validator
  std::shared_ptr<nlohmann::json_schema::json_validator> validator;
  {
    std::shared_lock<std::shared_mutex> lock(m_cache_mutex);
    auto it = m_schema_cache.find(a_schema_id);
    if (it == m_schema_cache.end()) {
      return ValidationResult::Fail(
          "Schema not found in cache: " + a_schema_id +
          ". Schema must be loaded before metadata validation.");
    }
    validator = it->second;
  }

  try {
    // Parse metadata
    nlohmann::json metadata = nlohmann::json::parse(a_metadata_content);

    // Use local error handler (thread-safe: stack-allocated per call)
    LocalJsonErrorHandler error_handler;

    // Validate against schema
    validator->validate(metadata, error_handler);

    // Check if any errors accumulated
    if (error_handler.hasErrors()) {
      DL_DEBUG(log_context,
               "Metadata validation errors: " << error_handler.errors());
      return ValidationResult::Fail(error_handler.errors());
    }

    DL_DEBUG(log_context,
             "Metadata validated successfully against schema " << a_schema_id);
    return ValidationResult::Ok();

  } catch (const nlohmann::json::parse_error &e) {
    std::string error = "Metadata JSON parse error: ";
    error += e.what();
    DL_DEBUG(log_context, "Metadata validation failed: " << error);
    return ValidationResult::Fail(error);

  } catch (const std::exception &e) {
    std::string error = "Metadata validation error: ";
    error += e.what();
    DL_DEBUG(log_context, "Metadata validation failed: " << error);
    return ValidationResult::Fail(error);
  }
}

// ── Cache Management ────────────────────────────────────────────────────────

bool JsonSchemaValidator::cacheSchema(const std::string &a_schema_id,
                                      const std::string &a_content,
                                      const std::string &a_format,
                                      LogContext log_context) {
  DL_DEBUG(log_context, "Caching schema: " << a_schema_id);

  if (!a_format.empty() && a_format != "json") {
    DL_ERROR(log_context, "Cannot cache schema " << a_schema_id
                              << ": unsupported format " << a_format);
    return false;
  }

  try {
    nlohmann::json schema = nlohmann::json::parse(a_content);
    
    // Enforce DataFed-specific requirements before caching
    enforceDataFedRequirements(schema);
    
    auto validator = compileSchema(schema, log_context);

    {
      std::unique_lock<std::shared_mutex> lock(m_cache_mutex);
      m_schema_cache[a_schema_id] = validator;
    }

    DL_DEBUG(log_context, "Schema cached successfully: " << a_schema_id);
    return true;

  } catch (const std::exception &e) {
    std::string error_msg = e.what();
    
    // Clarify confusing nlohmann error about format checkers
    if (error_msg.find("format checker was not provided") != std::string::npos) {
      DL_ERROR(log_context,
               "Failed to cache schema " << a_schema_id 
               << ": Schema uses JSON Schema 'format' keyword (e.g., \"format\": \"email\"), "
               << "but no format checker is registered for it. "
               << "Either remove the 'format' keyword or register a format checker for the nlohmann json validator. "
               << "Original error: " << error_msg);
    } else {
      DL_ERROR(log_context,
               "Failed to cache schema " << a_schema_id << ": " << error_msg);
    }
    return false;
  }
}

void JsonSchemaValidator::evictSchema(const std::string &a_schema_id) {
  std::unique_lock<std::shared_mutex> lock(m_cache_mutex);
  m_schema_cache.erase(a_schema_id);
}

void JsonSchemaValidator::clearCache() {
  std::unique_lock<std::shared_mutex> lock(m_cache_mutex);
  m_schema_cache.clear();
}

bool JsonSchemaValidator::isCached(const std::string &a_schema_id) const {
  std::shared_lock<std::shared_mutex> lock(m_cache_mutex);
  return m_schema_cache.find(a_schema_id) != m_schema_cache.end();
}

} // namespace Core
} // namespace SDMS
