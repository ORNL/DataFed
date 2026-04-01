#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaAPIClientIntegration
#include <boost/test/unit_test.hpp>

// Local private includes
#include "SchemaAPIClient.hpp"
#include "SchemaAPIConfig.hpp"

// DataFed Common includes
#include "common/TraceException.hpp"
#include "common/enums/error_code.pb.h"

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <memory>
#include <string>

using namespace SDMS::Core;
using SDMS::LogContext;
using json = nlohmann::json;

// ============================================================================
// Fixture
//
// Reads SCHEMA_API_TEST_URL from environment (default: http://localhost:4011).
//
// Helper methods set/clear the Prefer header between requests to steer Prism
// to specific response codes and named examples.
//
// Recommended Prism config:
//   PRISM_ERRORS=true   — rejects requests violating the OpenAPI spec
//   PRISM_DYNAMIC=false  — returns spec examples (not random data)
// ============================================================================

struct PrismFixture {
  std::unique_ptr<SchemaAPIClient> client;

  PrismFixture() { client = makeClient(); }

  std::unique_ptr<SchemaAPIClient> makeClient() {
    SchemaAPIConfig cfg;
    const char *url = std::getenv("SCHEMA_API_TEST_URL");
    cfg.base_url = url ? url : "http://localhost:4011";
    cfg.verify_ssl = false;
    cfg.connect_timeout_sec = 5;
    cfg.request_timeout_sec = 10;
    return std::make_unique<SchemaAPIClient>(cfg);
  }

  static LogContext ctx() {
    LogContext c;
    c.thread_name = "integration-test";
    c.thread_id = 0;
    c.correlation_id = "integration-test-corr";
    return c;
  }

  /// Set Prism to return a specific HTTP status code.
  void preferCode(int code) {
    client->setCustomHeaders(
        {{"Prefer", "code=" + std::to_string(code)}});
  }

  /// Set Prism to return a specific named example for the response.
  void preferExample(const std::string &name) {
    client->setCustomHeaders(
        {{"Prefer", "example=" + name}});
  }

  /// Set Prism to return a specific code AND named example.
  void preferCodeAndExample(int code, const std::string &name) {
    client->setCustomHeaders(
        {{"Prefer", "code=" + std::to_string(code)
                        + ", example=" + name}});
  }

  /// Clear Prefer header — Prism returns default (first) example.
  void preferDefault() { client->clearCustomHeaders(); }
};

// ============================================================================
// Constants
// ============================================================================

namespace {

const std::string TEST_SCHEMA_ID = "test-schema:1";

const std::string VALID_JSON_SCHEMA = R"({
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer", "minimum": 0 }
  },
  "required": ["name"]
})";

const std::string VALID_METADATA = R"({"name": "Alice", "age": 30})";

} // anonymous namespace

// ============================================================================
// PUT /schemas/{id} — Happy Path
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(PutSchemaHappy, PrismFixture)

BOOST_AUTO_TEST_CASE(put_accepted_with_all_required_fields) {
  auto log = ctx();

  BOOST_CHECK_NO_THROW(client->putSchema(
      TEST_SCHEMA_ID, "Person Schema", "A person object", "json", "JSONSchema",
      VALID_JSON_SCHEMA, "1.0.0", log));
}

BOOST_AUTO_TEST_CASE(put_accepted_without_optional_fields) {
  auto log = ctx();

  // description and version are optional per SchemaReplace
  BOOST_CHECK_NO_THROW(client->putSchema(
      TEST_SCHEMA_ID, "Minimal", "", "json", "JSONSchema",
      VALID_JSON_SCHEMA, "", log));
}

BOOST_AUTO_TEST_CASE(put_yaml_linkml_accepted) {
  auto log = ctx();

  BOOST_CHECK_NO_THROW(client->putSchema(
      TEST_SCHEMA_ID, "YAML Schema", "LinkML test", "yaml", "LinkML",
      "id: https://example.org/person", "1.0.0", log));
}

BOOST_AUTO_TEST_CASE(put_replaced_example) {
  preferExample("replaced");
  auto log = ctx();

  BOOST_CHECK_NO_THROW(client->putSchema(
      TEST_SCHEMA_ID, "Test", "", "json", "JSONSchema",
      VALID_JSON_SCHEMA, "1.0.0", log));
}

BOOST_AUTO_TEST_CASE(put_revised_example) {
  preferExample("revised");
  auto log = ctx();

  BOOST_CHECK_NO_THROW(client->putSchema(
      TEST_SCHEMA_ID, "Test", "", "json", "JSONSchema",
      VALID_JSON_SCHEMA, "1.0.0", log));
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// PUT /schemas/{id} — Error Paths
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(PutSchemaErrors, PrismFixture)

BOOST_AUTO_TEST_CASE(put_400_throws_service_error) {
  preferCode(400);
  auto log = ctx();

  BOOST_CHECK_THROW(
      client->putSchema(TEST_SCHEMA_ID, "X", "", "json", "JSONSchema",
                        VALID_JSON_SCHEMA, "1.0.0", log),
      TraceException);
}

BOOST_AUTO_TEST_CASE(put_500_throws_service_error) {
  preferCode(500);
  auto log = ctx();

  BOOST_CHECK_THROW(
      client->putSchema(TEST_SCHEMA_ID, "X", "", "json", "JSONSchema",
                        VALID_JSON_SCHEMA, "1.0.0", log),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// GET /schemas/{id} — Happy Path
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(GetSchemaHappy, PrismFixture)

BOOST_AUTO_TEST_CASE(get_returns_valid_schema_object) {
  auto log = ctx();

  json result;
  BOOST_REQUIRE_NO_THROW(result = client->getSchema(TEST_SCHEMA_ID, log));

  // SchemaGetResult required fields per spec
  BOOST_TEST(result.contains("id"));
  BOOST_TEST(result.contains("name"));
  BOOST_TEST(result.contains("schema_format"));
  BOOST_TEST(result.contains("engine"));
  BOOST_TEST(result.contains("content"));
  BOOST_TEST(result.contains("created_at"));
  BOOST_TEST(result.contains("updated_at"));
}

BOOST_AUTO_TEST_CASE(get_json_schema_example) {
  preferExample("json-schema");
  auto log = ctx();

  json result = client->getSchema(TEST_SCHEMA_ID, log);

  BOOST_TEST(result["schema_format"].get<std::string>() == "json");
  BOOST_TEST(result["engine"].get<std::string>() == "JSONSchema");
}

BOOST_AUTO_TEST_CASE(get_yaml_schema_example) {
  preferExample("yaml-schema");
  auto log = ctx();

  json result = client->getSchema(TEST_SCHEMA_ID, log);

  BOOST_TEST(result["schema_format"].get<std::string>() == "yaml");
  BOOST_TEST(result["engine"].get<std::string>() == "LinkML");
}

BOOST_AUTO_TEST_CASE(get_returns_string_typed_fields) {
  auto log = ctx();
  json result = client->getSchema(TEST_SCHEMA_ID, log);

  BOOST_TEST(result["id"].is_string());
  BOOST_TEST(result["name"].is_string());
  BOOST_TEST(result["content"].is_string());
  BOOST_TEST(result["schema_format"].is_string());
  BOOST_TEST(result["engine"].is_string());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// GET /schemas/{id} — Error Paths
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(GetSchemaErrors, PrismFixture)

BOOST_AUTO_TEST_CASE(get_404_throws) {
  preferCode(404);
  auto log = ctx();

  BOOST_CHECK_THROW(client->getSchema(TEST_SCHEMA_ID, log), TraceException);
}

BOOST_AUTO_TEST_CASE(get_500_throws) {
  preferCode(500);
  auto log = ctx();

  BOOST_CHECK_THROW(client->getSchema(TEST_SCHEMA_ID, log), TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// PATCH /schemas/{id} — Happy Path
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(PatchSchemaHappy, PrismFixture)

BOOST_AUTO_TEST_CASE(patch_name_only) {
  auto log = ctx();

  BOOST_CHECK_NO_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("Renamed"),
                          std::nullopt,  // description
                          std::nullopt,  // schema_format
                          std::nullopt,  // engine
                          std::nullopt,  // content
                          std::nullopt,  // version
                          log));
}

BOOST_AUTO_TEST_CASE(patch_content_and_version) {
  auto log = ctx();

  BOOST_CHECK_NO_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::nullopt,
                          std::nullopt,
                          std::nullopt,
                          std::nullopt,
                          std::optional<std::string>(VALID_JSON_SCHEMA),
                          std::optional<std::string>("2.0.0"),
                          log));
}

BOOST_AUTO_TEST_CASE(patch_all_fields) {
  auto log = ctx();

  BOOST_CHECK_NO_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("Full Update"),
                          std::optional<std::string>("Everything changed"),
                          std::optional<std::string>("json"),
                          std::optional<std::string>("JSONSchema"),
                          std::optional<std::string>(VALID_JSON_SCHEMA),
                          std::optional<std::string>("3.0.0"),
                          log));
}

BOOST_AUTO_TEST_CASE(patch_patched_example) {
  preferExample("patched");
  auto log = ctx();

  BOOST_CHECK_NO_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("Patched"),
                          std::nullopt, std::nullopt, std::nullopt,
                          std::nullopt, std::nullopt, log));
}

BOOST_AUTO_TEST_CASE(patch_revised_example) {
  preferExample("revised");
  auto log = ctx();

  BOOST_CHECK_NO_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("Revised"),
                          std::nullopt, std::nullopt, std::nullopt,
                          std::nullopt, std::nullopt, log));
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// PATCH /schemas/{id} — Error Paths
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(PatchSchemaErrors, PrismFixture)

BOOST_AUTO_TEST_CASE(patch_404_throws) {
  preferCode(404);
  auto log = ctx();

  BOOST_CHECK_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("X"),
                          std::nullopt, std::nullopt, std::nullopt,
                          std::nullopt, std::nullopt, log),
      TraceException);
}

BOOST_AUTO_TEST_CASE(patch_400_throws) {
  preferCode(400);
  auto log = ctx();

  BOOST_CHECK_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("X"),
                          std::nullopt, std::nullopt, std::nullopt,
                          std::nullopt, std::nullopt, log),
      TraceException);
}

BOOST_AUTO_TEST_CASE(patch_500_throws) {
  preferCode(500);
  auto log = ctx();

  BOOST_CHECK_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("X"),
                          std::nullopt, std::nullopt, std::nullopt,
                          std::nullopt, std::nullopt, log),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// DELETE /schemas/{id}
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(DeleteSchema, PrismFixture)

BOOST_AUTO_TEST_CASE(delete_204_succeeds) {
  // Default Prism response for DELETE is 204
  auto log = ctx();

  BOOST_CHECK_NO_THROW(client->deleteSchema(TEST_SCHEMA_ID, log));
}

BOOST_AUTO_TEST_CASE(delete_404_succeeds) {
  // Client explicitly treats 404 as acceptable for DELETE
  preferCode(404);
  auto log = ctx();

  BOOST_CHECK_NO_THROW(client->deleteSchema(TEST_SCHEMA_ID, log));
}

BOOST_AUTO_TEST_CASE(delete_500_throws) {
  preferCode(500);
  auto log = ctx();

  BOOST_CHECK_THROW(client->deleteSchema(TEST_SCHEMA_ID, log), TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// POST /schemas/validate — Happy Path
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(ValidateSchemaHappy, PrismFixture)

BOOST_AUTO_TEST_CASE(validate_schema_returns_true) {
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                                       errors, log);

  BOOST_TEST(result == true);
  BOOST_TEST(errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_schema_no_warnings_example) {
  preferExample("no-warnings");
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                                       errors, log);

  BOOST_TEST(result == true);
}

BOOST_AUTO_TEST_CASE(validate_schema_with_warnings_example) {
  // The with-warnings example still returns 200, so the client should
  // return true. The warnings field isn't captured by validateSchema
  // (only validateMetadata captures warnings), but the client must not
  // choke on the extra field.
  preferExample("with-warnings");
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                                       errors, log);

  BOOST_TEST(result == true);
}

BOOST_AUTO_TEST_CASE(validate_yaml_engine_accepted) {
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema(
      "yaml", "LinkML", "id: https://example.org/test", errors, log);

  BOOST_TEST(result == true);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// POST /schemas/validate — Error Paths
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(ValidateSchemaErrors, PrismFixture)

BOOST_AUTO_TEST_CASE(validate_schema_422_returns_false) {
  preferCode(422);
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                                       errors, log);

  BOOST_TEST(result == false);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_schema_422_invalid_type_example) {
  preferCodeAndExample(422, "invalid-type");
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                                       errors, log);

  BOOST_TEST(result == false);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_schema_422_malformed_example) {
  preferCodeAndExample(422, "malformed");
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                                       errors, log);

  BOOST_TEST(result == false);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_schema_400_throws) {
  preferCode(400);
  auto log = ctx();
  std::string errors;

  // 400 is not handled by validateSchema — falls through to the final
  // EXCEPT_PARAM which throws SERVICE_ERROR
  BOOST_CHECK_THROW(
      client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                             errors, log),
      TraceException);
}

BOOST_AUTO_TEST_CASE(validate_schema_500_throws) {
  preferCode(500);
  auto log = ctx();
  std::string errors;

  BOOST_CHECK_THROW(
      client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                             errors, log),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// POST /schemas/{id}/validate — Happy Path
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(ValidateMetadataHappy, PrismFixture)

BOOST_AUTO_TEST_CASE(validate_metadata_returns_true) {
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);

  BOOST_TEST(result == true);
  BOOST_TEST(errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_no_warnings_example) {
  preferExample("no-warnings");
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);

  BOOST_TEST(result == true);
  BOOST_TEST(warnings.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_with_warnings_example) {
  preferExample("with-warnings");
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);

  BOOST_TEST(result == true);
  BOOST_TEST(!warnings.empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// POST /schemas/{id}/validate — Error Paths
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(ValidateMetadataErrors, PrismFixture)

BOOST_AUTO_TEST_CASE(validate_metadata_422_returns_false) {
  preferCode(422);
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);

  BOOST_TEST(result == false);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_422_missing_required) {
  preferCodeAndExample(422, "missing-required");
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);

  BOOST_TEST(result == false);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_422_type_mismatch) {
  preferCodeAndExample(422, "type-mismatch");
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);

  BOOST_TEST(result == false);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_422_multiple_errors) {
  preferCodeAndExample(422, "multiple-errors");
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);

  BOOST_TEST(result == false);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(validate_metadata_404_throws) {
  preferCode(404);
  auto log = ctx();
  std::string errors, warnings;

  BOOST_CHECK_THROW(
      client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                               VALID_METADATA, errors, warnings, log),
      TraceException);
}

BOOST_AUTO_TEST_CASE(validate_metadata_400_throws) {
  preferCode(400);
  auto log = ctx();
  std::string errors, warnings;

  BOOST_CHECK_THROW(
      client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                               VALID_METADATA, errors, warnings, log),
      TraceException);
}

BOOST_AUTO_TEST_CASE(validate_metadata_500_throws) {
  preferCode(500);
  auto log = ctx();
  std::string errors, warnings;

  BOOST_CHECK_THROW(
      client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                               VALID_METADATA, errors, warnings, log),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Client Configuration
// ============================================================================

BOOST_AUTO_TEST_SUITE(ClientConfiguration)

BOOST_AUTO_TEST_CASE(empty_base_url_not_configured) {
  SchemaAPIConfig cfg;
  cfg.base_url = "";
  SchemaAPIClient unconfigured(cfg);

  BOOST_TEST(unconfigured.isConfigured() == false);
}

BOOST_AUTO_TEST_CASE(unconfigured_client_throws_on_all_operations) {
  SchemaAPIConfig cfg;
  cfg.base_url = "";
  SchemaAPIClient unconfigured(cfg);

  LogContext log;
  log.thread_name = "test";
  log.thread_id = 0;
  log.correlation_id = "test";

  BOOST_CHECK_THROW(
      unconfigured.putSchema("x", "x", "", "json", "JSONSchema", "{}", "1.0.0",
                             log),
      TraceException);

  BOOST_CHECK_THROW(unconfigured.getSchema("x", log), TraceException);

  BOOST_CHECK_THROW(unconfigured.deleteSchema("x", log), TraceException);

  BOOST_CHECK_THROW(
      unconfigured.patchSchema("x", std::optional<std::string>("y"),
                               std::nullopt, std::nullopt, std::nullopt,
                               std::nullopt, std::nullopt, log),
      TraceException);

  std::string e, w;
  BOOST_CHECK_THROW(
      unconfigured.validateSchema("json", "JSONSchema", "{}", e, log),
      TraceException);

  BOOST_CHECK_THROW(
      unconfigured.validateMetadata("x", "json", "JSONSchema", "{}", e, w,
                                    log),
      TraceException);
}

BOOST_AUTO_TEST_CASE(trailing_slash_normalized) {
  SchemaAPIConfig cfg;
  cfg.base_url = "http://localhost:4011/";
  cfg.verify_ssl = false;

  SchemaAPIClient client(cfg);
  BOOST_TEST(client.isConfigured() == true);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Custom Headers (verify the mechanism works end-to-end)
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(CustomHeaders, PrismFixture)

BOOST_AUTO_TEST_CASE(set_and_clear_custom_headers) {
  auto log = ctx();

  // Force 404 via Prefer header
  preferCode(404);
  BOOST_CHECK_THROW(client->getSchema(TEST_SCHEMA_ID, log), TraceException);

  // Clear headers — should get default 200
  preferDefault();
  json result;
  BOOST_CHECK_NO_THROW(result = client->getSchema(TEST_SCHEMA_ID, log));
  BOOST_TEST(result.contains("id"));
}

BOOST_AUTO_TEST_CASE(custom_headers_persist_across_calls) {
  auto log = ctx();

  preferCode(500);

  // Both calls should get 500
  BOOST_CHECK_THROW(client->getSchema("a:1", log), TraceException);
  BOOST_CHECK_THROW(client->getSchema("b:2", log), TraceException);

  preferDefault();
}

BOOST_AUTO_TEST_CASE(custom_headers_replaced_not_accumulated) {
  auto log = ctx();

  // Set to 500
  preferCode(500);
  BOOST_CHECK_EXCEPTION(
      client->getSchema(TEST_SCHEMA_ID, log),
      TraceException,
      [](const TraceException &ex) {
        // 500 path in httpGet should map to SERVICE_ERROR
        return ex.getErrorCode() == SDMS::SERVICE_ERROR;
      });

  // Replace with 404 — should NOT still have 500
  preferCode(404);
  BOOST_CHECK_EXCEPTION(
      client->getSchema(TEST_SCHEMA_ID, log),
      TraceException,
      [](const TraceException &ex) {
        // 404 path in httpGet should map to BAD_REQUEST
        return ex.getErrorCode() == SDMS::BAD_REQUEST;
      });

  // The 404 path in httpGet throws BAD_REQUEST, while 500 throws
  // SERVICE_ERROR. Both are TraceException, but at least we confirm the
  // header was replaced and the error type changed (if it were still 500 and
  // somehow the 404 handler ran, something would be very wrong).

  preferDefault();
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Contract Conformance
//
// These tests exist solely to verify the request body structure conforms
// to the OpenAPI spec. With PRISM_ERRORS=true, a non-conformant body causes
// Prism to return a validation error, which the client propagates as a
// throw. If these pass, the request bodies match the spec.
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(RequestConformance, PrismFixture)

BOOST_AUTO_TEST_CASE(put_body_conforms_to_SchemaReplace) {
  auto log = ctx();

  BOOST_CHECK_NO_THROW(client->putSchema(
      TEST_SCHEMA_ID, "Test", "Desc", "json", "JSONSchema",
      VALID_JSON_SCHEMA, "1.0.0", log));
}

BOOST_AUTO_TEST_CASE(patch_body_conforms_to_SchemaPatch) {
  auto log = ctx();

  BOOST_CHECK_NO_THROW(
      client->patchSchema(TEST_SCHEMA_ID,
                          std::optional<std::string>("Patched"),
                          std::nullopt, std::nullopt, std::nullopt,
                          std::nullopt, std::nullopt, log));
}

BOOST_AUTO_TEST_CASE(validate_schema_body_conforms_to_SchemaValidate) {
  auto log = ctx();
  std::string errors;

  bool result = client->validateSchema("json", "JSONSchema", VALID_JSON_SCHEMA,
                                       errors, log);
  BOOST_TEST(result == true);
}

BOOST_AUTO_TEST_CASE(validate_metadata_body_conforms_to_SchemaMetadataValidate) {
  auto log = ctx();
  std::string errors, warnings;

  bool result = client->validateMetadata(TEST_SCHEMA_ID, "json", "JSONSchema",
                                         VALID_METADATA, errors, warnings, log);
  BOOST_TEST(result == true);
}

BOOST_AUTO_TEST_SUITE_END()
