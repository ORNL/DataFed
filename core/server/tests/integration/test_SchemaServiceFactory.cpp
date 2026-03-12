#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaServiceFactoryIntegration
#include <boost/test/unit_test.hpp>

// Local includes
#include "SchemaServiceFactory.hpp"
#include "JsonSchemaValidator.hpp"
#include "NullSchemaValidator.hpp"

// Standard includes
#include <memory>
#include <string>

using namespace SDMS::Core;
using SDMS::LogContext;

// ============================================================================
// Test Helpers
// ============================================================================

namespace {

LogContext makeTestLogContext() {
  LogContext ctx;
  ctx.thread_name = "integration-test";
  ctx.thread_id = 0;
  ctx.correlation_id = "integration-test-correlation-id";
  return ctx;
}

const std::string VALID_SCHEMA = R"({
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer", "minimum": 0 }
  },
  "required": ["name"]
})";

const std::string VALID_METADATA = R"({
  "name": "Alice",
  "age": 30
})";

const std::string INVALID_METADATA_MISSING_REQUIRED = R"({
  "age": 30
})";

const std::string INVALID_METADATA_WRONG_TYPE = R"({
  "name": "Alice",
  "age": "not a number"
})";

} // anonymous namespace

// ============================================================================
// Test Suite: Factory with JsonSchemaValidator
// ============================================================================

BOOST_AUTO_TEST_SUITE(FactoryWithJsonSchemaValidator)

BOOST_AUTO_TEST_CASE(register_json_schema_validator) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();

  factory.registerValidator("JSONSchema", json_validator);

  ISchemaValidator &retrieved = factory.getValidator("JSONSchema");
  BOOST_TEST(retrieved.hasValidationCapability() == true);
}

BOOST_AUTO_TEST_CASE(validate_definition_through_factory) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();
  factory.registerValidator("JSONSchema", json_validator);
  auto ctx = makeTestLogContext();

  ISchemaValidator &validator = factory.getValidator("JSONSchema");
  auto result = validator.validateDefinition("json", VALID_SCHEMA, ctx);

  BOOST_TEST(result.valid == true);
  BOOST_TEST(result.errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_through_factory) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();
  factory.registerValidator("JSONSchema", json_validator);
  auto ctx = makeTestLogContext();

  ISchemaValidator &validator = factory.getValidator("JSONSchema");

  // Cache schema first
  bool cached = validator.cacheSchema("test-schema", VALID_SCHEMA, "json", ctx);
  BOOST_REQUIRE(cached);

  // Validate metadata
  auto result = validator.validateMetadata("test-schema", "json", VALID_METADATA, ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_CASE(invalid_metadata_fails_through_factory) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();
  factory.registerValidator("JSONSchema", json_validator);
  auto ctx = makeTestLogContext();

  ISchemaValidator &validator = factory.getValidator("JSONSchema");
  validator.cacheSchema("test-schema", VALID_SCHEMA, "json", ctx);

  auto result = validator.validateMetadata(
      "test-schema", "json", INVALID_METADATA_MISSING_REQUIRED, ctx);

  BOOST_TEST(result.valid == false);
  BOOST_TEST(!result.errors.empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Factory with NullSchemaValidator as Default
// ============================================================================

BOOST_AUTO_TEST_SUITE(FactoryWithNullDefault)

BOOST_AUTO_TEST_CASE(null_validator_as_default_for_legacy) {
  SchemaServiceFactory factory;
  auto null_validator = std::make_shared<NullSchemaValidator>();
  auto json_validator = std::make_shared<JsonSchemaValidator>();

  factory.setDefaultValidator(null_validator);
  factory.registerValidator("JSONSchema", json_validator);

  // JSONSchema engine gets real validation
  BOOST_TEST(factory.getValidator("JSONSchema").hasValidationCapability() == true);

  // Empty/unknown engines get null validator (no validation)
  BOOST_TEST(factory.getValidator("").hasValidationCapability() == false);
  BOOST_TEST(factory.getValidator("native").hasValidationCapability() == false);
  BOOST_TEST(factory.getValidator("other").hasValidationCapability() == false);
}

BOOST_AUTO_TEST_CASE(null_validator_accepts_anything) {
  SchemaServiceFactory factory;
  auto null_validator = std::make_shared<NullSchemaValidator>();
  factory.setDefaultValidator(null_validator);
  auto ctx = makeTestLogContext();

  ISchemaValidator &validator = factory.getValidator("legacy");

  // Invalid JSON passes with null validator
  auto result = validator.validateDefinition("json", "{ broken json }", ctx);
  BOOST_TEST(result.valid == true);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Multiple Validators
// ============================================================================

BOOST_AUTO_TEST_SUITE(MultipleValidators)

BOOST_AUTO_TEST_CASE(different_engines_use_different_validators) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();
  auto null_validator = std::make_shared<NullSchemaValidator>();

  factory.registerValidator("JSONSchema", json_validator);
  factory.registerValidator("other", null_validator);
  factory.setDefaultValidator(null_validator);

  // JSONSchema has validation capability
  BOOST_TEST(factory.getValidator("JSONSchema").hasValidationCapability() == true);

  // "other" explicitly registered as null
  BOOST_TEST(factory.getValidator("other").hasValidationCapability() == false);

  // Unknown falls back to default (null)
  BOOST_TEST(factory.getValidator("unknown").hasValidationCapability() == false);
}

BOOST_AUTO_TEST_CASE(each_engine_has_independent_cache) {
  SchemaServiceFactory factory;
  auto validator1 = std::make_shared<JsonSchemaValidator>();
  auto validator2 = std::make_shared<JsonSchemaValidator>();

  factory.registerValidator("Engine1", validator1);
  factory.registerValidator("Engine2", validator2);
  auto ctx = makeTestLogContext();

  // Cache schema in Engine1's validator
  factory.getValidator("Engine1").cacheSchema("shared-id", VALID_SCHEMA, "json", ctx);

  // Engine1 can validate against it
  auto result1 = factory.getValidator("Engine1").validateMetadata(
      "shared-id", "json", VALID_METADATA, ctx);
  BOOST_TEST(result1.valid == true);

  // Engine2 does NOT have it cached (separate instance)
  auto result2 = factory.getValidator("Engine2").validateMetadata(
      "shared-id", "json", VALID_METADATA, ctx);
  BOOST_TEST(result2.valid == false);  // Schema not found
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Realistic DataFed Configuration
// ============================================================================

BOOST_AUTO_TEST_SUITE(RealisticDataFedConfiguration)

BOOST_AUTO_TEST_CASE(typical_datafed_setup) {
  // Simulate how DataFed would configure the factory at startup
  SchemaServiceFactory factory;

  // NullSchemaValidator for legacy schemas (no validation)
  auto null_validator = std::make_shared<NullSchemaValidator>();

  // JsonSchemaValidator for JSON Schema validation
  auto json_validator = std::make_shared<JsonSchemaValidator>();

  // Configure factory
  factory.setDefaultValidator(null_validator);  // Legacy default
  factory.registerValidator("JSONSchema", json_validator);

  auto ctx = makeTestLogContext();

  // Test: JSONSchema engine validates properly
  {
    ISchemaValidator &v = factory.getValidator("JSONSchema");

    auto def_result = v.validateDefinition("json", VALID_SCHEMA, ctx);
    BOOST_TEST(def_result.valid == true);

    v.cacheSchema("user-schema", VALID_SCHEMA, "json", ctx);

    auto valid_result = v.validateMetadata("user-schema", "json", VALID_METADATA, ctx);
    BOOST_TEST(valid_result.valid == true);

    auto invalid_result = v.validateMetadata(
        "user-schema", "json", INVALID_METADATA_WRONG_TYPE, ctx);
    BOOST_TEST(invalid_result.valid == false);
  }

  // Test: Empty engine (legacy) skips validation
  {
    ISchemaValidator &v = factory.getValidator("");
    BOOST_TEST(v.hasValidationCapability() == false);

    auto result = v.validateDefinition("json", "not even json {{{", ctx);
    BOOST_TEST(result.valid == true);  // No validation = always passes
  }

  // Test: "native" engine (legacy) skips validation
  {
    ISchemaValidator &v = factory.getValidator("native");
    BOOST_TEST(v.hasValidationCapability() == false);
  }
}

BOOST_AUTO_TEST_SUITE_END()
