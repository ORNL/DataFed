#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaHandler

// Local includes
#include "client_handlers/SchemaHandler.hpp"

// DataFed Common includes
#include "common/DynaLog.hpp"

// Third party includes
#include <boost/test/unit_test.hpp>
#include <google/protobuf/stubs/common.h>

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

// Missing "properties" field
const std::string NO_PROPERTIES = R"({ "type": "object" })";

// Missing "type" field
const std::string NO_TYPE = R"({
  "properties": { "x": { "type": "string" } }
})";

} // namespace TestData

// ============================================================================
// Test Suite: handleCreate / handleRevise / handleUpdate (with DB)
//
// These tests exercise the full handler flow through the factory pattern.
// SchemaHandler's constructor now sets up the factory with json-schema
// storage and validator, so requests must set type="json-schema" and
// format="json" to route correctly.
//
// Requires: DATAFED_TEST_DB_URL, DATAFED_TEST_DB_USER, DATAFED_TEST_DB_PASS
//           environment variables pointing at a test ArangoDB.
//
// If env vars are not set, the suite is skipped.
//
// NOTE: Pure schema validation logic (enforceDataFedRequirements, definition
// parsing, format checks) is tested in test_JsonSchemaValidator.cpp.
// These tests verify the integration: factory routing, DB persistence,
// and error propagation through the handler layer.
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

// ============================================================================
// Test Suite: handleCreate validation through factory
// ============================================================================

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
  request.set_type("json-schema");
  request.set_format("json");
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
  request.set_type("json-schema");
  request.set_format("json");
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
  request.set_type("json-schema");
  request.set_format("json");
  request.set_def(TestData::NO_TYPE);

  SDMS::SchemaDataReply reply;

  BOOST_CHECK_THROW(
      f.handler.handleCreate("u/test_user", request, reply, f.log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_empty_type_throws) {
  // Verify that empty type (no registered default) fails with a clear error
  // rather than silently passing or hitting an unrelated crash.
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  SDMS::SchemaCreateRequest request;
  request.set_id("test-no-type-field:1");
  request.set_desc("test");
  request.set_pub(false);
  request.set_sys(false);
  // Deliberately NOT setting type — factory has no default
  request.set_format("json");
  request.set_def(TestData::VALID_SCHEMA);

  SDMS::SchemaDataReply reply;

  // Should throw because factory can't resolve empty engine to a validator
  BOOST_CHECK_THROW(
      f.handler.handleCreate("u/test_user", request, reply, f.log_context),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: handleRevise validation through factory
// ============================================================================

BOOST_AUTO_TEST_SUITE(HandleReviseWithDB)

BOOST_AUTO_TEST_CASE(revise_without_def_skips_validation) {
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  SDMS::SchemaReviseRequest request;
  request.set_id("test-schema:1");
  // Deliberately NOT setting def — validation should be skipped

  SDMS::SchemaDataReply reply;

  // May throw from DB if schema doesn't exist, but must NOT throw
  // from validation. Distinguish by checking the error message.
  try {
    f.handler.handleRevise("u/test_user", request, reply, f.log_context);
  } catch (TraceException &e) {
    std::string msg = e.toString();
    BOOST_TEST(msg.find("Invalid metadata schema") == std::string::npos);
    BOOST_TEST(msg.find("Schema validation failed") == std::string::npos);
  }
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: handleUpdate validation through factory
// ============================================================================

BOOST_AUTO_TEST_SUITE(HandleUpdateWithDB)

BOOST_AUTO_TEST_CASE(update_without_def_skips_validation) {
  DatabaseFixture f;
  if (!f.isAvailable()) {
    BOOST_TEST_MESSAGE("Skipping: test DB not configured");
    return;
  }

  SDMS::SchemaUpdateRequest request;
  request.set_id("test-schema:1");
  // Deliberately NOT setting def — validation should be skipped

  SDMS::SchemaDataReply reply;

  try {
    f.handler.handleUpdate("u/test_user", request, reply, f.log_context);
  } catch (TraceException &e) {
    std::string msg = e.toString();
    BOOST_TEST(msg.find("Invalid metadata schema") == std::string::npos);
    BOOST_TEST(msg.find("Schema validation failed") == std::string::npos);
  }
}

BOOST_AUTO_TEST_SUITE_END()

// Note: The proto field "def" is a reserved word in Python (requiring
// setattr(msg, 'def', value)), but in C++ set_def()/def() work normally.
//
// NOTE: set_type() and set_format() must be called on requests to route
// through the factory correctly. The factory has no default registered —
// empty type will throw.
