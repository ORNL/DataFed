#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaHandlerIntegration
#include <boost/test/unit_test.hpp>

// Local includes
#include "client_handlers/SchemaHandler.hpp"
#include "DatabaseAPI.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <cstdlib>
#include <memory>
#include <string>
#include <vector>

using namespace SDMS::Core;
using namespace SDMS;

// ============================================================================
// Fixture
//
// Connects to a live ArangoDB instance with Foxx services installed.
//
// Required environment variables:
//   DATAFED_TEST_ARANGO_URL    — e.g. "http://localhost:8529"
//   DATAFED_TEST_ARANGO_USER   — e.g. "root"
//   DATAFED_TEST_ARANGO_PASS   — password
//
// Optional:
//   DATAFED_TEST_ARANGO_DB     — database name (default: "sdms")
//
// If env vars are missing, all tests in this file are skipped (not failed).
//
// Each test case uses the fixture's createTestSchema / cleanup helpers
// to avoid test interdependencies.
// ============================================================================

namespace {

const std::string TEST_USER = "u/integration_test_user";

const std::string VALID_SCHEMA_DEF = R"({
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "value": { "type": "number" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["name", "value"]
})";

const std::string UPDATED_SCHEMA_DEF = R"({
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "value": { "type": "number" },
    "unit": { "type": "string" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["name", "value"]
})";

const std::string VALID_METADATA = R"({
  "name": "widget",
  "value": 42.0,
  "tags": ["alpha", "beta"]
})";

const std::string INVALID_METADATA_MISSING_REQUIRED = R"({
  "value": 42.0
})";

const std::string INVALID_METADATA_WRONG_TYPE = R"({
  "name": "widget",
  "value": "not_a_number"
})";

const std::string INVALID_JSON = R"({not valid json at all)";

const std::string SCHEMA_MISSING_TYPE = R"({
  "properties": { "x": { "type": "string" } }
})";

const std::string SCHEMA_MISSING_PROPERTIES = R"({ "type": "object" })";

} // anonymous namespace

struct ArangoFixture {
  std::unique_ptr<DatabaseAPI> db;
  std::unique_ptr<SchemaHandler> handler;
  LogContext log_context;
  bool available;

  // Track created schema IDs for cleanup
  std::vector<std::string> created_schemas;

  ArangoFixture() : available(false) {
    std::string url = getEnv("DATAFED_TEST_ARANGO_URL");
    std::string user = getEnv("DATAFED_TEST_ARANGO_USER");
    std::string pass = getEnv("DATAFED_TEST_ARANGO_PASS");

    if (url.empty() || user.empty()) {
      return;
    }

    log_context.thread_name = "schema-handler-integration";
    log_context.thread_id = 0;
    log_context.correlation_id = "schema-handler-test";

    try {
      db = std::make_unique<DatabaseAPI>(url, user, pass);
      handler = std::make_unique<SchemaHandler>(*db);
      available = true;
    } catch (std::exception &e) {
      BOOST_TEST_MESSAGE("ArangoDB connection failed: " << e.what());
    }
  }

  ~ArangoFixture() { cleanup(); }

  void cleanup() {
    if (!available || !handler)
      return;

    for (auto it = created_schemas.rbegin(); it != created_schemas.rend();
         ++it) {
      try {
        SchemaDeleteRequest req;
        AckReply reply;
        req.set_id(*it);
        handler->handleDelete(TEST_USER, req, reply, log_context);
      } catch (...) {
        // Best-effort cleanup — don't mask test failures
      }
    }
    created_schemas.clear();
  }

  /// Create a schema and track it for cleanup. Returns the schema ID.
  std::string createTestSchema(const std::string &name,
                               const std::string &def = VALID_SCHEMA_DEF,
                               const std::string &desc = "integration test") {
    SchemaCreateRequest req;
    SchemaDataReply reply;

    req.set_id(name);
    req.set_def(def);
    req.set_desc(desc);
    req.set_pub(false);
    req.set_sys(false);
    req.set_type("json-schema");
    req.set_format("json");

    handler->handleCreate(TEST_USER, req, reply, log_context);

    std::string id = reply.schema(0).id();
    created_schemas.push_back(id);
    return id;
  }

  bool isAvailable() const { return available; }

  static std::string getEnv(const char *name) {
    const char *val = std::getenv(name);
    if (!val || std::string(val).empty())
      return "";
    return val;
  }
};

/// Skip macro — avoids nesting every test body in an if block.
#define SKIP_IF_UNAVAILABLE()                                                  \
  if (!isAvailable()) {                                                        \
    BOOST_TEST_MESSAGE("Skipping: test ArangoDB not configured");              \
    return;                                                                    \
  }

// ============================================================================
// Test Suite: handleCreate
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(HandleCreate, ArangoFixture)

BOOST_AUTO_TEST_CASE(create_valid_schema) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_create_valid");

  // ID should be versioned: name:version
  BOOST_TEST(id.find("test_create_valid:") != std::string::npos);
}

BOOST_AUTO_TEST_CASE(create_and_view_round_trip) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_create_view", VALID_SCHEMA_DEF,
                                    "round trip test");

  // View it back
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);

  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  BOOST_TEST(view_reply.schema(0).id() == id);
  BOOST_TEST(view_reply.schema(0).desc() == "round trip test");

  // def should contain the schema definition
  std::string returned_def = view_reply.schema(0).def();
  BOOST_TEST(!returned_def.empty());

  // Parse and verify structure
  nlohmann::json parsed = nlohmann::json::parse(returned_def);
  BOOST_TEST(parsed.contains("properties"));
  BOOST_TEST(parsed["type"].get<std::string>() == "object");
}

BOOST_AUTO_TEST_CASE(create_with_invalid_json_throws) {
  SKIP_IF_UNAVAILABLE();

  SchemaCreateRequest req;
  SchemaDataReply reply;

  req.set_id("test_bad_json");
  req.set_def(INVALID_JSON);
  req.set_desc("should fail");
  req.set_pub(false);
  req.set_sys(false);
  req.set_type("json-schema");
  req.set_format("json");

  BOOST_CHECK_THROW(
      handler->handleCreate(TEST_USER, req, reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_missing_properties_throws) {
  SKIP_IF_UNAVAILABLE();

  SchemaCreateRequest req;
  SchemaDataReply reply;

  req.set_id("test_no_props");
  req.set_def(SCHEMA_MISSING_PROPERTIES);
  req.set_desc("should fail");
  req.set_pub(false);
  req.set_sys(false);
  req.set_type("json-schema");
  req.set_format("json");

  BOOST_CHECK_THROW(
      handler->handleCreate(TEST_USER, req, reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_missing_type_throws) {
  SKIP_IF_UNAVAILABLE();

  SchemaCreateRequest req;
  SchemaDataReply reply;

  req.set_id("test_no_type");
  req.set_def(SCHEMA_MISSING_TYPE);
  req.set_desc("should fail");
  req.set_pub(false);
  req.set_sys(false);
  req.set_type("json-schema");
  req.set_format("json");

  BOOST_CHECK_THROW(
      handler->handleCreate(TEST_USER, req, reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_description) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_create_desc", VALID_SCHEMA_DEF,
                                    "detailed description here");

  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);

  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  BOOST_TEST(view_reply.schema(0).desc() == "detailed description here");
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: handleRevise
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(HandleRevise, ArangoFixture)

BOOST_AUTO_TEST_CASE(revise_creates_new_version) {
  SKIP_IF_UNAVAILABLE();

  std::string id_v1 = createTestSchema("test_revise");

  // Revise with updated definition
  SchemaReviseRequest rev_req;
  SchemaDataReply rev_reply;
  rev_req.set_id(id_v1);
  rev_req.set_def(UPDATED_SCHEMA_DEF);
  rev_req.set_desc("revised version");

  handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context);

  BOOST_REQUIRE(rev_reply.schema_size() > 0);
  std::string id_v2 = rev_reply.schema(0).id();
  created_schemas.push_back(id_v2);

  // New ID should differ from original
  BOOST_TEST(id_v2 != id_v1);

  // View the new revision
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id_v2);

  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  BOOST_TEST(view_reply.schema(0).desc() == "revised version");

  // Verify the new definition has the added field
  nlohmann::json parsed =
      nlohmann::json::parse(view_reply.schema(0).def());
  BOOST_TEST(parsed["properties"].contains("unit"));
}

BOOST_AUTO_TEST_CASE(revise_without_def_skips_validation) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_revise_no_def");

  // Revise with no def — should not throw from validation
  SchemaReviseRequest rev_req;
  SchemaDataReply rev_reply;
  rev_req.set_id(id);
  // Deliberately NOT setting def

  // May throw from DB (revision logic) but must NOT throw from validation
  try {
    handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context);
    if (rev_reply.schema_size() > 0) {
      created_schemas.push_back(rev_reply.schema(0).id());
    }
  } catch (TraceException &e) {
    std::string msg = e.toString();
    BOOST_TEST(msg.find("Invalid metadata schema") == std::string::npos);
    BOOST_TEST(msg.find("Schema validation failed") == std::string::npos);
  }
}

BOOST_AUTO_TEST_CASE(revise_with_invalid_def_throws) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_revise_bad_def");

  SchemaReviseRequest rev_req;
  SchemaDataReply rev_reply;
  rev_req.set_id(id);
  rev_req.set_def(INVALID_JSON);

  BOOST_CHECK_THROW(
      handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: handleUpdate
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(HandleUpdate, ArangoFixture)

BOOST_AUTO_TEST_CASE(update_description_only) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_update_desc", VALID_SCHEMA_DEF,
                                    "original description");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_desc("updated description");

  handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);

  // View and verify
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);
  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  BOOST_TEST(view_reply.schema(0).desc() == "updated description");
}

BOOST_AUTO_TEST_CASE(update_definition) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_update_def");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_def(UPDATED_SCHEMA_DEF);

  handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);

  // View and verify the new def
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);
  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  nlohmann::json parsed =
      nlohmann::json::parse(view_reply.schema(0).def());
  BOOST_TEST(parsed["properties"].contains("unit"));
}

BOOST_AUTO_TEST_CASE(update_without_def_skips_validation) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_update_no_def");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  // Deliberately NOT setting def — only description
  upd_req.set_desc("description only update");

  // Must NOT throw from validation
  try {
    handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);
  } catch (TraceException &e) {
    std::string msg = e.toString();
    BOOST_TEST(msg.find("Invalid metadata schema") == std::string::npos);
    BOOST_TEST(msg.find("Schema validation failed") == std::string::npos);
  }
}

BOOST_AUTO_TEST_CASE(update_with_invalid_def_throws) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_update_bad_def");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_def(INVALID_JSON);

  BOOST_CHECK_THROW(
      handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: handleDelete
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(HandleDelete, ArangoFixture)

BOOST_AUTO_TEST_CASE(delete_existing_schema) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_delete");

  // Remove from cleanup list — we're manually deleting
  created_schemas.pop_back();

  SchemaDeleteRequest del_req;
  AckReply del_reply;
  del_req.set_id(id);

  BOOST_CHECK_NO_THROW(
      handler->handleDelete(TEST_USER, del_req, del_reply, log_context));

  // Verify it's gone — view should throw
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);

  BOOST_CHECK_THROW(
      handler->handleView(TEST_USER, view_req, view_reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: handleSearch
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(HandleSearch, ArangoFixture)

BOOST_AUTO_TEST_CASE(search_finds_created_schemas) {
  SKIP_IF_UNAVAILABLE();

  // Create a few schemas with a common prefix
  createTestSchema("test_search_a");
  createTestSchema("test_search_b");
  createTestSchema("test_search_c");

  SchemaSearchRequest search_req;
  SchemaDataReply search_reply;
  search_req.set_id("test_search_");

  handler->handleSearch(TEST_USER, search_req, search_reply, log_context);

  BOOST_TEST(search_reply.schema_size() >= 3);
}

BOOST_AUTO_TEST_CASE(search_returns_def_content) {
  SKIP_IF_UNAVAILABLE();

  createTestSchema("test_search_def");

  SchemaSearchRequest search_req;
  SchemaDataReply search_reply;
  search_req.set_id("test_search_def");

  handler->handleSearch(TEST_USER, search_req, search_reply, log_context);

  BOOST_REQUIRE(search_reply.schema_size() > 0);

  // def should be populated (hydrated from storage)
  std::string def = search_reply.schema(0).def();
  BOOST_TEST(!def.empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Metadata Validation
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(MetadataValidation, ArangoFixture)

BOOST_AUTO_TEST_CASE(valid_metadata_passes) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_validate_pass");

  std::string errors = handler->validateMetadataContent(
      id, VALID_METADATA, log_context);

  BOOST_TEST(errors.empty());
}

BOOST_AUTO_TEST_CASE(missing_required_field_fails) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_validate_missing");

  std::string errors = handler->validateMetadataContent(
      id, INVALID_METADATA_MISSING_REQUIRED, log_context);

  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(wrong_type_fails) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_validate_type");

  std::string errors = handler->validateMetadataContent(
      id, INVALID_METADATA_WRONG_TYPE, log_context);

  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(invalid_json_metadata_fails) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_validate_bad_json");

  std::string errors = handler->validateMetadataContent(
      id, INVALID_JSON, log_context);

  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(nonexistent_schema_returns_error) {
  SKIP_IF_UNAVAILABLE();

  std::string errors = handler->validateMetadataContent(
      "does_not_exist:99", VALID_METADATA, log_context);

  // Should return an error string, not throw
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(handle_metadata_validate_sets_errors_on_failure) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_handle_validate_fail");

  MetadataValidateRequest req;
  MetadataValidateReply reply;
  req.set_sch_id(id);
  req.set_metadata(INVALID_METADATA_MISSING_REQUIRED);

  handler->handleMetadataValidate(TEST_USER, req, reply, log_context);

  BOOST_TEST(!reply.errors().empty());
}

BOOST_AUTO_TEST_CASE(handle_metadata_validate_no_errors_on_success) {
  SKIP_IF_UNAVAILABLE();

  std::string id = createTestSchema("test_handle_validate_pass");

  MetadataValidateRequest req;
  MetadataValidateReply reply;
  req.set_sch_id(id);
  req.set_metadata(VALID_METADATA);

  handler->handleMetadataValidate(TEST_USER, req, reply, log_context);

  BOOST_TEST(reply.errors().empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Full Lifecycle
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(FullLifecycle, ArangoFixture)

BOOST_AUTO_TEST_CASE(create_validate_update_revise_delete) {
  SKIP_IF_UNAVAILABLE();

  // 1. Create
  std::string id = createTestSchema("test_lifecycle", VALID_SCHEMA_DEF,
                                    "lifecycle test v1");

  // 2. Validate metadata against it
  {
    std::string errors = handler->validateMetadataContent(
        id, VALID_METADATA, log_context);
    BOOST_TEST(errors.empty());
  }

  // 3. Validate bad metadata
  {
    std::string errors = handler->validateMetadataContent(
        id, INVALID_METADATA_MISSING_REQUIRED, log_context);
    BOOST_TEST(!errors.empty());
  }

  // 4. Update description
  {
    SchemaUpdateRequest upd_req;
    SchemaDataReply upd_reply;
    upd_req.set_id(id);
    upd_req.set_desc("lifecycle test v1 updated");

    handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);
  }

  // 5. View and verify update
  {
    SchemaViewRequest view_req;
    SchemaDataReply view_reply;
    view_req.set_id(id);
    handler->handleView(TEST_USER, view_req, view_reply, log_context);

    BOOST_REQUIRE(view_reply.schema_size() > 0);
    BOOST_TEST(view_reply.schema(0).desc() == "lifecycle test v1 updated");
  }

  // 6. Revise with new definition
  std::string id_v2;
  {
    SchemaReviseRequest rev_req;
    SchemaDataReply rev_reply;
    rev_req.set_id(id);
    rev_req.set_def(UPDATED_SCHEMA_DEF);
    rev_req.set_desc("lifecycle test v2");

    handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context);

    BOOST_REQUIRE(rev_reply.schema_size() > 0);
    id_v2 = rev_reply.schema(0).id();
    created_schemas.push_back(id_v2);

    BOOST_TEST(id_v2 != id);
  }

  // 7. Validate metadata against new revision
  {
    std::string errors = handler->validateMetadataContent(
        id_v2, VALID_METADATA, log_context);
    BOOST_TEST(errors.empty());
  }

  // 8. Delete both versions
  {
    // Remove from cleanup — we're deleting manually
    created_schemas.clear();

    SchemaDeleteRequest del_req;
    AckReply del_reply;

    del_req.set_id(id_v2);
    BOOST_CHECK_NO_THROW(
        handler->handleDelete(TEST_USER, del_req, del_reply, log_context));

    del_req.set_id(id);
    BOOST_CHECK_NO_THROW(
        handler->handleDelete(TEST_USER, del_req, del_reply, log_context));
  }

  // 9. Verify both are gone
  {
    SchemaViewRequest view_req;
    SchemaDataReply view_reply;

    view_req.set_id(id);
    BOOST_CHECK_THROW(
        handler->handleView(TEST_USER, view_req, view_reply, log_context),
        TraceException);

    view_req.set_id(id_v2);
    BOOST_CHECK_THROW(
        handler->handleView(TEST_USER, view_req, view_reply, log_context),
        TraceException);
  }
}

BOOST_AUTO_TEST_SUITE_END()
