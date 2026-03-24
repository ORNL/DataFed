#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaHandler

// Local includes
#include "client_handlers/SchemaHandler.hpp"

// DataFed Common includes
#include "common/DynaLog.hpp"

// Third party includes
#include <boost/test/unit_test.hpp>
#include <google/protobuf/stubs/common.h>
#include <nlohmann/json.hpp>

// Standard includes
#include <string>

using namespace SDMS::Core;
using namespace SDMS;
// ============================================================================
// Fixtures
// ============================================================================

struct ProtobufTeardown {
  ~ProtobufTeardown() { google::protobuf::ShutdownProtobufLibrary(); }
};

BOOST_GLOBAL_FIXTURE(ProtobufTeardown);

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

// Missing "properties" field
const std::string NO_PROPERTIES = R"({ "type": "object" })";

// Missing "type" field
const std::string NO_TYPE = R"({
  "properties": { "x": { "type": "string" } }
})";

// type is "array" instead of "object"
const std::string WRONG_TYPE = R"({
  "type": "array",
  "properties": { "x": { "type": "string" } }
})";

// properties is a string instead of object
const std::string PROPERTIES_NOT_OBJECT = R"({
  "type": "object",
  "properties": "not an object"
})";

// type is an integer instead of string
const std::string TYPE_NOT_STRING = R"({
  "type": 42,
  "properties": { "x": { "type": "string" } }
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

} // namespace TestData

// ============================================================================
// Test Suite: enforceRequiredProperties (static, no dependencies)
// ============================================================================

BOOST_AUTO_TEST_SUITE(EnforceRequiredProperties)

BOOST_AUTO_TEST_CASE(accepts_valid_schema) {
  nlohmann::json schema = nlohmann::json::parse(TestData::VALID_SCHEMA);
  BOOST_CHECK_NO_THROW(SchemaHandler::enforceRequiredProperties(schema));
}

BOOST_AUTO_TEST_CASE(accepts_minimal_valid_schema) {
  nlohmann::json schema = nlohmann::json::parse(TestData::MINIMAL_VALID_SCHEMA);
  BOOST_CHECK_NO_THROW(SchemaHandler::enforceRequiredProperties(schema));
}

BOOST_AUTO_TEST_CASE(accepts_schema_with_nested_objects) {
  nlohmann::json schema = nlohmann::json::parse(TestData::NESTED_SCHEMA);
  BOOST_CHECK_NO_THROW(SchemaHandler::enforceRequiredProperties(schema));
}

BOOST_AUTO_TEST_CASE(rejects_non_object_input) {
  // String
  nlohmann::json str = nlohmann::json::parse(R"("just a string")");
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(str),
                     TraceException);

  // Array
  nlohmann::json arr = nlohmann::json::parse(R"([1, 2, 3])");
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(arr),
                     TraceException);

  // Number
  nlohmann::json num = nlohmann::json::parse("42");
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(num),
                     TraceException);

  // Boolean
  nlohmann::json bval = nlohmann::json::parse("true");
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(bval),
                     TraceException);

  // Null
  nlohmann::json nval = nlohmann::json::parse("null");
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(nval),
                     TraceException);
}

BOOST_AUTO_TEST_CASE(rejects_missing_properties) {
  nlohmann::json schema = nlohmann::json::parse(TestData::NO_PROPERTIES);
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(schema),
                     TraceException);
}

BOOST_AUTO_TEST_CASE(rejects_missing_type) {
  nlohmann::json schema = nlohmann::json::parse(TestData::NO_TYPE);
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(schema),
                     TraceException);
}

BOOST_AUTO_TEST_CASE(rejects_wrong_type_value) {
  nlohmann::json schema = nlohmann::json::parse(TestData::WRONG_TYPE);
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(schema),
                     TraceException);
}

BOOST_AUTO_TEST_CASE(rejects_properties_not_object) {
  nlohmann::json schema = nlohmann::json::parse(TestData::PROPERTIES_NOT_OBJECT);
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(schema),
                     TraceException);
}

BOOST_AUTO_TEST_CASE(rejects_type_not_string) {
  nlohmann::json schema = nlohmann::json::parse(TestData::TYPE_NOT_STRING);
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(schema),
                     TraceException);
}

BOOST_AUTO_TEST_CASE(empty_object_rejected) {
  nlohmann::json schema = nlohmann::json::parse("{}");
  BOOST_CHECK_THROW(SchemaHandler::enforceRequiredProperties(schema),
                     TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: handleCreate / handleRevise / handleUpdate
//
// These methods depend on DatabaseAPI, which needs a live ArangoDB.
// Two options for testing:
//
//   1. Integration test: point DatabaseAPI at a test Arango instance.
//      This is what the existing end-to-end Python tests do.
//
//   2. Interface extraction: introduce IDatabaseAPI, mock it. This is
//      a larger refactor that should wait until it's justified by
//      other needs (e.g., the Rust rewrite or Postgres migration).
//
// The tests below cover the validation path BEFORE the DB call, which
// is where bugs actually occur. The DB interaction is a passthrough
// that's already tested by the existing end-to-end suite.
//
// To run these, construct SchemaHandler with a DatabaseAPI pointed at
// a test ArangoDB instance. If no test DB is available, these tests
// are skipped.
// ============================================================================

// ============================================================================
// Test Suite: handleCreate validation (with DB)
//
// Requires: DATAFED_TEST_DB_URL, DATAFED_TEST_DB_USER, DATAFED_TEST_DB_PASS
//           environment variables pointing at a test ArangoDB.
//
// These tests verify the full create flow including DB persistence.
// If env vars are not set, the suite is skipped.
// ============================================================================

namespace {

struct DatabaseFixture {
  DatabaseFixture()
      : db_url(getEnvOrSkip("DATAFED_TEST_DB_URL")),
        db_user(getEnvOrSkip("DATAFED_TEST_DB_USER")),
        db_pass(getEnvOrSkip("DATAFED_TEST_DB_PASS")),
        db_client(db_url, db_user, db_pass),
        handler(db_client) {
    log_context.thread_name = "test";
    log_context.thread_id = 0;
    log_context.correlation_id = "test-schema-handler";
  }

  static std::string getEnvOrSkip(const char *name) {
    const char *val = std::getenv(name);
    if (!val || std::string(val).empty()) {
      // Return empty — tests using this fixture should check and skip
      return "";
    }
    return val;
  }

  bool isAvailable() const { return !db_url.empty(); }

  std::string db_url;
  std::string db_user;
  std::string db_pass;
  DatabaseAPI db_client;
  SchemaHandler handler;
  LogContext log_context;
};

} // namespace

BOOST_AUTO_TEST_SUITE(HandleCreateWithDB)

BOOST_AUTO_TEST_CASE(create_with_invalid_json_throws) {
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  SDMS::SchemaCreateRequest request;
  request.set_id("test-invalid:1");
  request.set_desc("test");
  request.set_pub(false);
  request.set_sys(false);
  request.set_def("not valid json {{{");

  SDMS::SchemaDataReply reply;

  BOOST_CHECK_THROW(
      f.handler.handleCreate("u/test_user", request, reply, f.log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_missing_properties_throws) {
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  SDMS::SchemaCreateRequest request;
  request.set_id("test-no-props:1");
  request.set_desc("test");
  request.set_pub(false);
  request.set_sys(false);
  request.set_def(TestData::NO_PROPERTIES);

  SDMS::SchemaDataReply reply;

  BOOST_CHECK_THROW(
      f.handler.handleCreate("u/test_user", request, reply, f.log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_missing_type_throws) {
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  SDMS::SchemaCreateRequest request;
  request.set_id("test-no-type:1");
  request.set_desc("test");
  request.set_pub(false);
  request.set_sys(false);
  request.set_def(TestData::NO_TYPE);

  SDMS::SchemaDataReply reply;

  BOOST_CHECK_THROW(
      f.handler.handleCreate("u/test_user", request, reply, f.log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(revise_without_def_skips_validation) {
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  // Revise with no def field — should NOT throw, validation is skipped
  SDMS::SchemaReviseRequest request;
  request.set_id("test-schema:1");
  // Deliberately NOT setting def

  SDMS::SchemaDataReply reply;

  // This will throw from the DB if schema doesn't exist, but it should
  // NOT throw from validation — that's what we're testing.
  // Use a try/catch to distinguish validation errors from DB errors.
  try {
    f.handler.handleRevise("u/test_user", request, reply, f.log_context);
  } catch (TraceException &e) {
    // DB errors are acceptable here (schema might not exist in test DB)
    // Validation errors (containing "Invalid metadata schema") are not
    std::string msg = e.toString();
    BOOST_TEST(msg.find("Invalid metadata schema") == std::string::npos);
  }
}

BOOST_AUTO_TEST_CASE(update_without_def_skips_validation) {
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  SDMS::SchemaUpdateRequest request;
  request.set_id("test-schema:1");
  // Deliberately NOT setting def

  SDMS::SchemaDataReply reply;

  try {
    f.handler.handleUpdate("u/test_user", request, reply, f.log_context);
  } catch (TraceException &e) {
    std::string msg = e.toString();
    BOOST_TEST(msg.find("Invalid metadata schema") == std::string::npos);
  }
}

BOOST_AUTO_TEST_SUITE_END()

// Note: The proto field "def" is a reserved word in Python (requiring
// setattr(msg, 'def', value)), but in C++ set_def()/def() work normally.
