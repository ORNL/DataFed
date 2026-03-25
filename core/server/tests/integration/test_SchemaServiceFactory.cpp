#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaServiceFactoryIntegration
#include <boost/test/unit_test.hpp>

// Local includes
#include "SchemaServiceFactory.hpp"
#include "ISchemaStorage.hpp"
#include "schema_validators/JsonSchemaValidator.hpp"
#include "schema_validators/NullSchemaValidator.hpp"

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

// ---------------------------------------------------------------------------
// Minimal mock — only needs to satisfy setDefaultSchemaType's precondition
// that a storage is registered. No storage methods are exercised by these
// tests, so every override is a no-op / trivial return.
// ---------------------------------------------------------------------------
class MockStorage : public ISchemaStorage {
public:
  explicit MockStorage(const std::string &a_label) : m_label(a_label) {}

  std::string storeContent(const std::string & /*a_id*/,
                           const std::string &a_content,
                           const std::string & /*a_desc*/,
                           const std::string & /*a_schema_format*/,
                           const std::string & /*a_engine*/,
                           const std::string & /*a_version*/,
                           LogContext /*log_context*/) override {
    return a_content;
  }

  StorageRetrieveResult retrieveContent(const std::string & /*a_id*/,
                                        const std::string &a_arango_def,
                                        LogContext /*log_context*/) override {
    return StorageRetrieveResult::Ok(a_arango_def);
  }

  std::string updateContent(const std::string & /*a_id*/,
                            const std::string &a_content,
                            const std::optional<std::string> & /*a_desc*/,
                            const std::optional<std::string> & /*a_schema_format*/,
                            const std::optional<std::string> & /*a_engine*/,
                            const std::optional<std::string> & /*a_version*/,
                            LogContext /*log_context*/) override {
    return a_content;
  }

  void deleteContent(const std::string & /*a_id*/,
                     LogContext /*log_context*/) override {}

private:
  std::string m_label;
};

/// Helper: register a NullSchemaValidator as the default fallback engine.
/// The factory requires both storage and validator for an engine before
/// it can be set as default via setDefaultSchemaType.
void registerNullDefault(SchemaServiceFactory &factory,
                         const std::string &engine = "null-default") {
  factory.registerValidator(engine, std::make_shared<NullSchemaValidator>());
  factory.registerStorage(engine, std::make_shared<MockStorage>("default"));
  factory.setDefaultSchemaType(engine);
}

} // anonymous namespace

// ============================================================================
// Test Suite: Factory with JsonSchemaValidator
// ============================================================================

BOOST_AUTO_TEST_SUITE(FactoryWithJsonSchemaValidator)

BOOST_AUTO_TEST_CASE(register_json_schema_validator) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();

  factory.registerValidator("json-schema", json_validator);

  ISchemaValidator &retrieved = factory.getValidator("json-schema");
  BOOST_TEST(retrieved.hasValidationCapability() == true);
}

BOOST_AUTO_TEST_CASE(validate_definition_through_factory) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();
  factory.registerValidator("json-schema", json_validator);
  auto ctx = makeTestLogContext();

  ISchemaValidator &validator = factory.getValidator("json-schema");
  auto result = validator.validateDefinition("json", VALID_SCHEMA, ctx);

  BOOST_TEST(result.valid == true);
  BOOST_TEST(result.errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_through_factory) {
  SchemaServiceFactory factory;
  auto json_validator = std::make_shared<JsonSchemaValidator>();
  factory.registerValidator("json-schema", json_validator);
  auto ctx = makeTestLogContext();

  ISchemaValidator &validator = factory.getValidator("json-schema");

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
  factory.registerValidator("json-schema", json_validator);
  auto ctx = makeTestLogContext();

  ISchemaValidator &validator = factory.getValidator("json-schema");
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
  auto json_validator = std::make_shared<JsonSchemaValidator>();

  // Register json-schema engine (needs both validator + storage)
  factory.registerValidator("json-schema", json_validator);
  factory.registerStorage("json-schema", std::make_shared<MockStorage>("json"));

  // Register null-default as the fallback engine
  registerNullDefault(factory);

  // json-schema engine gets real validation
  BOOST_TEST(factory.getValidator("json-schema").hasValidationCapability() == true);

  // Empty/unknown engines fall back to the null-default engine
  BOOST_TEST(factory.getValidator("").hasValidationCapability() == false);
  BOOST_TEST(factory.getValidator("native").hasValidationCapability() == false);
  BOOST_TEST(factory.getValidator("other").hasValidationCapability() == false);
}

BOOST_AUTO_TEST_CASE(null_validator_accepts_anything) {
  SchemaServiceFactory factory;
  auto ctx = makeTestLogContext();

  // Register null-default as the fallback engine
  registerNullDefault(factory);

  // "legacy" is unregistered, resolves to the null-default
  ISchemaValidator &validator = factory.getValidator("legacy");

  // Invalid JSON passes with null validator — no validation capability
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

  factory.registerValidator("json-schema", json_validator);
  factory.registerStorage("json-schema", std::make_shared<MockStorage>("json"));

  factory.registerValidator("other", null_validator);
  factory.registerStorage("other", std::make_shared<MockStorage>("other"));

  // Set "other" (null) as the default fallback
  factory.setDefaultSchemaType("other");

  // json-schema has validation capability
  BOOST_TEST(factory.getValidator("json-schema").hasValidationCapability() == true);

  // "other" explicitly registered as null
  BOOST_TEST(factory.getValidator("other").hasValidationCapability() == false);

  // Unknown falls back to default ("other" / null)
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

  // Configure factory — register both engines with storage + validator
  factory.registerValidator("json-schema", json_validator);
  factory.registerStorage("json-schema", std::make_shared<MockStorage>("json"));

  factory.registerValidator("legacy-null", null_validator);
  factory.registerStorage("legacy-null", std::make_shared<MockStorage>("legacy"));

  // Legacy null engine is the fallback for empty/unknown engine strings
  factory.setDefaultSchemaType("legacy-null");

  auto ctx = makeTestLogContext();

  // Test: json-schema engine validates properly
  {
    ISchemaValidator &v = factory.getValidator("json-schema");

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
