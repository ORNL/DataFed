#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE JsonSchemaValidator
#include <boost/test/unit_test.hpp>

// Local includes
#include "schema_validators/JsonSchemaValidator.hpp"

// Standard includes
#include <string>

using namespace SDMS::Core;
using SDMS::LogContext;

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

namespace {

struct LoggingFixture {
  LoggingFixture() {
    SDMS::global_logger.setSysLog(false);
    SDMS::global_logger.addStream(std::cerr);
    SDMS::global_logger.setLevel(SDMS::LogLevel::DEBUG);
  }
};

LogContext makeTestLogContext() {
  LogContext ctx;
  ctx.thread_name = "test";
  ctx.thread_id = 0;
  ctx.correlation_id = "test-correlation-id";
  return ctx;
}

} // anonymous namespace

// ============================================================================
// Test Data
// ============================================================================

namespace TestData {

const std::string VALID_SCHEMA = R"({
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer", "minimum": 0 }
  },
  "required": ["name"]
})";

const std::string MINIMAL_VALID_SCHEMA = R"({
  "type": "object",
  "properties": {}
})";

const std::string NESTED_SCHEMA = R"({
  "type": "object",
  "properties": {
    "address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" },
        "zip": { "type": "string", "pattern": "^[0-9]{5}$" }
      },
      "required": ["street"]
    }
  }
})";

// Missing "properties" field
const std::string SCHEMA_MISSING_PROPERTIES = R"({ "type": "object" })";

// Missing "type" field
const std::string SCHEMA_MISSING_TYPE = R"({
  "properties": { "x": { "type": "string" } }
})";

// type is "array" instead of "object"
const std::string SCHEMA_WRONG_TYPE = R"({
  "type": "array",
  "properties": { "x": { "type": "string" } }
})";

// properties is a string instead of object
const std::string SCHEMA_PROPERTIES_NOT_OBJECT = R"({
  "type": "object",
  "properties": "not an object"
})";

// type is an integer instead of string
const std::string SCHEMA_TYPE_NOT_STRING = R"({
  "type": 42,
  "properties": { "x": { "type": "string" } }
})";

// Not a JSON object at root
const std::string SCHEMA_NOT_OBJECT = R"(["array", "not", "object"])";

// Invalid JSON syntax
const std::string INVALID_JSON = R"({ "broken: json })";

// Valid metadata matching VALID_SCHEMA
const std::string VALID_METADATA = R"({
  "name": "John Doe",
  "age": 30
})";

// Metadata missing required field
const std::string METADATA_MISSING_REQUIRED = R"({
  "age": 30
})";

// Metadata with wrong type
const std::string METADATA_WRONG_TYPE = R"({
  "name": "John",
  "age": "not a number"
})";

// Metadata violating minimum constraint
const std::string METADATA_CONSTRAINT_VIOLATION = R"({
  "name": "John",
  "age": -5
})";

// Schema that references another schema via $ref
const std::string SCHEMA_WITH_REF = R"({
  "type": "object",
  "properties": {
    "address": { "$ref": "address-schema" }
  }
})";

// Referenced schema
const std::string ADDRESS_SCHEMA = R"({
  "type": "object",
  "properties": {
    "street": { "type": "string" },
    "city": { "type": "string" }
  }
})";

} // namespace TestData

// ============================================================================
// Test Suite: Construction and Capability
// ============================================================================

BOOST_GLOBAL_FIXTURE(LoggingFixture);

BOOST_AUTO_TEST_SUITE(ConstructionAndCapability)

BOOST_AUTO_TEST_CASE(default_construction) {
  JsonSchemaValidator validator;
  BOOST_TEST(validator.hasValidationCapability() == true);
}

BOOST_AUTO_TEST_CASE(construction_with_loader) {
  auto loader = [](const std::string &, LogContext) -> nlohmann::json {
    return nlohmann::json::object();
  };
  JsonSchemaValidator validator(loader);
  BOOST_TEST(validator.hasValidationCapability() == true);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: DataFed Schema Requirements
//
// These tests exercise enforceDataFedRequirements() through the public
// validateDefinition() API. This logic was originally on
// SchemaHandler::enforceRequiredProperties() and was moved here during
// the factory refactor.
// ============================================================================

BOOST_AUTO_TEST_SUITE(DataFedSchemaRequirements)

BOOST_AUTO_TEST_CASE(accepts_valid_schema) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", TestData::VALID_SCHEMA, ctx);
  BOOST_TEST(result.valid == true);
  BOOST_TEST(result.errors.empty());
}

BOOST_AUTO_TEST_CASE(accepts_minimal_valid_schema) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::MINIMAL_VALID_SCHEMA, ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_CASE(accepts_schema_with_nested_objects) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::NESTED_SCHEMA, ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_CASE(rejects_non_object_json_array) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_NOT_OBJECT, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(rejects_non_object_json_string) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", R"("just a string")", ctx);
  BOOST_TEST(result.valid == false);
}

BOOST_AUTO_TEST_CASE(rejects_non_object_json_number) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", "42", ctx);
  BOOST_TEST(result.valid == false);
}

BOOST_AUTO_TEST_CASE(rejects_non_object_json_boolean) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", "true", ctx);
  BOOST_TEST(result.valid == false);
}

BOOST_AUTO_TEST_CASE(rejects_non_object_json_null) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", "null", ctx);
  BOOST_TEST(result.valid == false);
}

BOOST_AUTO_TEST_CASE(rejects_missing_properties) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_MISSING_PROPERTIES, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(rejects_missing_type) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_MISSING_TYPE, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(rejects_wrong_type_value) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_WRONG_TYPE, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(rejects_properties_not_object) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_PROPERTIES_NOT_OBJECT, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(rejects_type_not_string) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_TYPE_NOT_STRING, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(rejects_empty_object) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", "{}", ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Schema Definition Validation (format/content handling)
// ============================================================================

BOOST_AUTO_TEST_SUITE(SchemaDefinitionValidation)

BOOST_AUTO_TEST_CASE(empty_content_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", "", ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(invalid_json_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::INVALID_JSON, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(unsupported_format_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "yaml", TestData::VALID_SCHEMA, ctx);
  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(empty_format_treated_as_json) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("", TestData::VALID_SCHEMA, ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_CASE(whitespace_only_content_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition("json", "   \n\t  ", ctx);
  BOOST_TEST(result.valid == false);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Schema Caching
// ============================================================================

BOOST_AUTO_TEST_SUITE(SchemaCaching)

BOOST_AUTO_TEST_CASE(cache_valid_schema) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  BOOST_TEST(validator.isCached("test-schema") == false);

  bool cached = validator.cacheSchema(
      "test-schema", TestData::VALID_SCHEMA, "json", ctx);

  BOOST_TEST(cached == true);
  BOOST_TEST(validator.isCached("test-schema") == true);
}

BOOST_AUTO_TEST_CASE(cache_invalid_schema_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  bool cached = validator.cacheSchema(
      "bad-schema", TestData::INVALID_JSON, "json", ctx);

  BOOST_TEST(cached == false);
  BOOST_TEST(validator.isCached("bad-schema") == false);
}

BOOST_AUTO_TEST_CASE(cache_schema_missing_datafed_requirements_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  bool cached = validator.cacheSchema(
      "incomplete", TestData::SCHEMA_MISSING_TYPE, "json", ctx);

  BOOST_TEST(cached == false);
  BOOST_TEST(validator.isCached("incomplete") == false);
}

BOOST_AUTO_TEST_CASE(evict_schema) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("to-evict", TestData::VALID_SCHEMA, "json", ctx);
  BOOST_TEST(validator.isCached("to-evict") == true);

  validator.evictSchema("to-evict");

  BOOST_TEST(validator.isCached("to-evict") == false);
}

BOOST_AUTO_TEST_CASE(evict_nonexistent_schema_is_safe) {
  JsonSchemaValidator validator;

  validator.evictSchema("never-existed");
  BOOST_TEST(validator.isCached("never-existed") == false);
}

BOOST_AUTO_TEST_CASE(clear_cache) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("schema1", TestData::VALID_SCHEMA, "json", ctx);
  validator.cacheSchema("schema2", TestData::VALID_SCHEMA, "json", ctx);
  BOOST_TEST(validator.isCached("schema1") == true);
  BOOST_TEST(validator.isCached("schema2") == true);

  validator.clearCache();

  BOOST_TEST(validator.isCached("schema1") == false);
  BOOST_TEST(validator.isCached("schema2") == false);
}

BOOST_AUTO_TEST_CASE(cache_overwrites_existing) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("my-schema", TestData::VALID_SCHEMA, "json", ctx);
  BOOST_TEST(validator.isCached("my-schema") == true);

  const std::string DIFFERENT_SCHEMA = R"({
    "type": "object",
    "properties": {
      "different": { "type": "boolean" }
    }
  })";
  bool cached = validator.cacheSchema(
      "my-schema", DIFFERENT_SCHEMA, "json", ctx);

  BOOST_TEST(cached == true);
  BOOST_TEST(validator.isCached("my-schema") == true);
}

BOOST_AUTO_TEST_CASE(cache_unsupported_format_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  bool cached = validator.cacheSchema(
      "yaml-schema", TestData::VALID_SCHEMA, "yaml", ctx);

  BOOST_TEST(cached == false);
  BOOST_TEST(validator.isCached("yaml-schema") == false);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Metadata Validation
// ============================================================================

BOOST_AUTO_TEST_SUITE(MetadataValidation)

BOOST_AUTO_TEST_CASE(valid_metadata_passes) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "json", TestData::VALID_METADATA, ctx);

  BOOST_TEST(result.valid == true);
  BOOST_TEST(result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_missing_required_field_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "json", TestData::METADATA_MISSING_REQUIRED, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_wrong_type_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "json", TestData::METADATA_WRONG_TYPE, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_constraint_violation_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "json", TestData::METADATA_CONSTRAINT_VIOLATION, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_empty_content_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "json", "", ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_invalid_json_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "json", TestData::INVALID_JSON, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_validation_uncached_schema_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateMetadata(
      "nonexistent-schema", "json", TestData::VALID_METADATA, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_unsupported_format_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "yaml", TestData::VALID_METADATA, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(metadata_empty_format_treated_as_json) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("person-schema", TestData::VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "person-schema", "", TestData::VALID_METADATA, ctx);

  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Schema Reference Resolution ($ref)
// ============================================================================

BOOST_AUTO_TEST_SUITE(SchemaReferenceResolution)

BOOST_AUTO_TEST_CASE(schema_with_ref_resolves_via_loader) {
  bool loader_called = false;
  std::string requested_id;

  auto loader = [&](const std::string &schema_id,
                     LogContext) -> nlohmann::json {
    loader_called = true;
    requested_id = schema_id;
    return nlohmann::json::parse(TestData::ADDRESS_SCHEMA);
  };

  JsonSchemaValidator validator(loader);
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_WITH_REF, ctx);

  BOOST_TEST(result.valid == true);
  BOOST_TEST(loader_called == true);
  BOOST_TEST(requested_id == "address-schema");
}

BOOST_AUTO_TEST_CASE(schema_ref_without_loader_fails) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_WITH_REF, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(loader_can_be_set_after_construction) {
  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  bool loader_called = false;
  validator.setSchemaLoader(
      [&](const std::string &, LogContext) -> nlohmann::json {
        loader_called = true;
        return nlohmann::json::parse(TestData::ADDRESS_SCHEMA);
      });

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_WITH_REF, ctx);

  BOOST_TEST(result.valid == true);
  BOOST_TEST(loader_called == true);
}

BOOST_AUTO_TEST_CASE(loader_exception_causes_validation_failure) {
  auto loader = [](const std::string &, LogContext) -> nlohmann::json {
    throw std::runtime_error("Schema not found");
  };

  JsonSchemaValidator validator(loader);
  auto ctx = makeTestLogContext();

  auto result = validator.validateDefinition(
      "json", TestData::SCHEMA_WITH_REF, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_CASE(ref_resolution_works_for_cached_schemas) {
  auto loader = [](const std::string &, LogContext) -> nlohmann::json {
    return nlohmann::json::parse(TestData::ADDRESS_SCHEMA);
  };

  JsonSchemaValidator validator(loader);
  auto ctx = makeTestLogContext();

  bool cached = validator.cacheSchema(
      "ref-schema", TestData::SCHEMA_WITH_REF, "json", ctx);
  BOOST_TEST(cached == true);

  // Validate metadata against the cached schema that uses $ref
  auto result = validator.validateMetadata(
      "ref-schema", "json",
      R"({ "address": { "street": "123 Main", "city": "Anywhere" } })",
      ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Complex Schema Scenarios
// ============================================================================

BOOST_AUTO_TEST_SUITE(ComplexSchemaScenarios)

BOOST_AUTO_TEST_CASE(nested_objects_validation) {
  const std::string NESTED_OBJ_SCHEMA = R"({
    "type": "object",
    "properties": {
      "user": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "email": { "type": "string" }
        },
        "required": ["name"]
      }
    }
  })";

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("nested-schema", NESTED_OBJ_SCHEMA, "json", ctx);

  auto valid_result = validator.validateMetadata(
      "nested-schema", "json",
      R"({ "user": { "name": "Alice", "email": "alice@example.com" } })",
      ctx);
  BOOST_TEST(valid_result.valid == true);

  auto invalid_result = validator.validateMetadata(
      "nested-schema", "json",
      R"({ "user": { "email": "no-name@example.com" } })",
      ctx);
  BOOST_TEST(invalid_result.valid == false);
}

BOOST_AUTO_TEST_CASE(array_validation) {
  const std::string ARRAY_SCHEMA = R"({
    "type": "object",
    "properties": {
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 1
      }
    }
  })";

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("array-schema", ARRAY_SCHEMA, "json", ctx);

  auto valid_result = validator.validateMetadata(
      "array-schema", "json", R"({ "tags": ["science", "data"] })", ctx);
  BOOST_TEST(valid_result.valid == true);

  auto empty_result = validator.validateMetadata(
      "array-schema", "json", R"({ "tags": [] })", ctx);
  BOOST_TEST(empty_result.valid == false);

  auto wrong_type_result = validator.validateMetadata(
      "array-schema", "json", R"({ "tags": [1, 2, 3] })", ctx);
  BOOST_TEST(wrong_type_result.valid == false);
}

BOOST_AUTO_TEST_CASE(enum_validation) {
  const std::string ENUM_SCHEMA = R"({
    "type": "object",
    "properties": {
      "status": {
        "type": "string",
        "enum": ["pending", "active", "completed"]
      }
    }
  })";

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("enum-schema", ENUM_SCHEMA, "json", ctx);

  auto valid_result = validator.validateMetadata(
      "enum-schema", "json", R"({ "status": "active" })", ctx);
  BOOST_TEST(valid_result.valid == true);

  auto invalid_result = validator.validateMetadata(
      "enum-schema", "json", R"({ "status": "unknown" })", ctx);
  BOOST_TEST(invalid_result.valid == false);
}

BOOST_AUTO_TEST_CASE(pattern_validation) {
  const std::string PATTERN_SCHEMA = R"({
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^[A-Z]{2}[0-9]{4}$"
      }
    }
  })";

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("pattern-schema", PATTERN_SCHEMA, "json", ctx);

  auto valid_result = validator.validateMetadata(
      "pattern-schema", "json", R"({ "id": "AB1234" })", ctx);
  BOOST_TEST(valid_result.valid == true);

  auto invalid_result = validator.validateMetadata(
      "pattern-schema", "json", R"({ "id": "invalid" })", ctx);
  BOOST_TEST(invalid_result.valid == false);
}

BOOST_AUTO_TEST_CASE(additional_properties_validation) {
  const std::string STRICT_SCHEMA = R"({
    "type": "object",
    "properties": {
      "name": { "type": "string" }
    },
    "additionalProperties": false
  })";

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("strict-schema", STRICT_SCHEMA, "json", ctx);

  auto valid_result = validator.validateMetadata(
      "strict-schema", "json", R"({ "name": "Test" })", ctx);
  BOOST_TEST(valid_result.valid == true);

  auto invalid_result = validator.validateMetadata(
      "strict-schema", "json",
      R"({ "name": "Test", "extra": "not allowed" })", ctx);
  BOOST_TEST(invalid_result.valid == false);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: ValidationResult Structure
// ============================================================================

BOOST_AUTO_TEST_SUITE(ValidationResultStructure)

BOOST_AUTO_TEST_CASE(ok_result_has_correct_fields) {
  auto result = ValidationResult::Ok();

  BOOST_TEST(result.valid == true);
  BOOST_TEST(result.errors.empty());
  BOOST_TEST(result.warnings.empty());
}

BOOST_AUTO_TEST_CASE(ok_result_with_warnings) {
  auto result = ValidationResult::Ok("Some warning");

  BOOST_TEST(result.valid == true);
  BOOST_TEST(result.errors.empty());
  BOOST_TEST(result.warnings == "Some warning");
}

BOOST_AUTO_TEST_CASE(fail_result_has_correct_fields) {
  auto result = ValidationResult::Fail("Error message");

  BOOST_TEST(result.valid == false);
  BOOST_TEST(result.errors == "Error message");
  BOOST_TEST(result.warnings.empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

BOOST_AUTO_TEST_SUITE(EdgeCases)

BOOST_AUTO_TEST_CASE(unicode_in_schema_and_metadata) {
  const std::string UNICODE_SCHEMA = R"({
    "type": "object",
    "properties": {
      "名前": { "type": "string" },
      "説明": { "type": "string" }
    }
  })";

  const std::string UNICODE_METADATA = R"({
    "名前": "テスト",
    "説明": "日本語のテスト"
  })";

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  auto def_result = validator.validateDefinition(
      "json", UNICODE_SCHEMA, ctx);
  BOOST_TEST(def_result.valid == true);

  validator.cacheSchema("unicode-schema", UNICODE_SCHEMA, "json", ctx);

  auto md_result = validator.validateMetadata(
      "unicode-schema", "json", UNICODE_METADATA, ctx);
  BOOST_TEST(md_result.valid == true);
}

BOOST_AUTO_TEST_CASE(large_metadata_object) {
  const std::string FLEXIBLE_SCHEMA = R"({
    "type": "object",
    "properties": {
      "data": { "type": "object" }
    }
  })";

  nlohmann::json large_data;
  large_data["data"] = nlohmann::json::object();
  for (int i = 0; i < 1000; ++i) {
    large_data["data"]["field_" + std::to_string(i)] = i;
  }

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("flex-schema", FLEXIBLE_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "flex-schema", "json", large_data.dump(), ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_CASE(deeply_nested_metadata) {
  const std::string NESTED_SCHEMA = R"({
    "type": "object",
    "properties": {
      "level1": { "type": "object" }
    }
  })";

  nlohmann::json nested;
  nlohmann::json *current = &nested;
  for (int i = 1; i <= 50; ++i) {
    (*current)["level" + std::to_string(i)] = nlohmann::json::object();
    current = &((*current)["level" + std::to_string(i)]);
  }
  (*current)["value"] = "deep";

  JsonSchemaValidator validator;
  auto ctx = makeTestLogContext();

  validator.cacheSchema("nested-schema", NESTED_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "nested-schema", "json", nested.dump(), ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_SUITE_END()
