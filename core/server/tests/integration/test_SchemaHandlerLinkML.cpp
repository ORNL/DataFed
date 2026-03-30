#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaHandlerLinkMLIntegration
#include <boost/test/unit_test.hpp>

// Local includes
#include "client_handlers/SchemaHandler.hpp"
#include "DatabaseAPI.hpp"
#include "Config.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <cstdlib>
#include <chrono>
#include <thread>
#include <memory>
#include <string>
#include <vector>

using namespace SDMS::Core;
using namespace SDMS;

// ============================================================================
// Constants
//
// Uses real LinkML schema syntax validated by the LinkML Python toolkit.
// Metadata is JSON — the SchemaDBApi service converts LinkML schemas to
// JSON Schema internally for metadata validation.
// ============================================================================

namespace {

const std::string TEST_USER = "u/integration_test_user";

const std::string LINKML_FORMAT = "yaml";
const std::string LINKML_ENGINE = "linkml";

const std::string VALID_LINKML_SCHEMA_DEF = R"(id: https://example.org/test-schema
name: test_schema
prefixes:
  linkml: https://w3id.org/linkml/
  test_schema: https://example.org/test-schema/
imports:
  - linkml:types
default_range: string
default_prefix: test_schema

classes:
  Experiment:
    attributes:
      id:
        required: true
      name:
        required: true
      description:
      sample_count:
        range: integer
      tags:
        multivalued: true
)";

const std::string UPDATED_LINKML_SCHEMA_DEF = R"(id: https://example.org/test-schema
name: test_schema
prefixes:
  linkml: https://w3id.org/linkml/
  test_schema: https://example.org/test-schema/
imports:
  - linkml:types
default_range: string
default_prefix: test_schema

classes:
  Experiment:
    attributes:
      id:
        required: true
      name:
        required: true
      description:
      sample_count:
        range: integer
      unit:
      tags:
        multivalued: true
)";

// Conforms to Experiment with all required fields
const std::string VALID_LINKML_METADATA = R"({
  "id": "exp001",
  "name": "trial run",
  "description": "initial experiment",
  "sample_count": 5,
  "tags": ["alpha", "beta"]
})";

// Missing required "id" and "name" fields
const std::string INVALID_LINKML_METADATA_MISSING_REQUIRED = R"({
  "sample_count": 5
})";

// sample_count should be integer, not string
const std::string INVALID_LINKML_METADATA_WRONG_TYPE = R"({
  "id": "exp001",
  "name": "trial run",
  "sample_count": "not_a_number"
})";

// Not valid YAML at all
const std::string INVALID_YAML = R"(
  not: valid: yaml: {{{{
  - [unterminated
)";

// Structurally valid YAML but not a valid LinkML schema —
// references a type that doesn't exist
const std::string INVALID_LINKML_SCHEMA = R"(id: https://example.org/bad
name: bad_schema
prefixes:
  linkml: https://w3id.org/linkml/
imports:
  - linkml:types
default_range: string

classes:
  Broken:
    attributes:
      x:
        range: NonExistentType
)";

} // anonymous namespace

// ============================================================================
// Fixture
//
// Requires all the same ArangoDB env vars as the json-schema tests, plus
// the external SchemaDBApi service.
//
// Required environment variables:
//   DATAFED_TEST_ARANGO_URL        — e.g. "http://localhost:8529"
//   DATAFED_TEST_ARANGO_USER       — e.g. "root"
//   DATAFED_TEST_ARANGO_PASS       — password
//   DATAFED_TEST_SCHEMA_API_URL    — e.g. "http://localhost:8080/v1"
//
// Optional:
//   DATAFED_TEST_SCHEMA_API_TOKEN  — bearer token (empty = no auth)
//
// If any required env var is missing, all tests are skipped (not failed).
// ============================================================================

struct LinkMLFixture {
  std::unique_ptr<DatabaseAPI> db;
  std::unique_ptr<SchemaHandler> handler;
  LogContext log_context;
  bool available;

  std::vector<std::string> created_schemas;

  LinkMLFixture() : available(false) {
    std::string arango_url  = getEnv("DATAFED_TEST_ARANGO_URL");
    std::string arango_user = getEnv("DATAFED_TEST_ARANGO_USER");
    std::string arango_pass = getEnv("DATAFED_TEST_ARANGO_PASS");
    std::string schema_url  = getEnv("DATAFED_TEST_SCHEMA_API_URL");

    if (arango_url.empty() || arango_user.empty() || schema_url.empty()) {
      return;
    }

    log_context.thread_name = "linkml-handler-integration";
    log_context.thread_id = 0;
    log_context.correlation_id = "linkml-handler-test";

    try {
      db = std::make_unique<DatabaseAPI>(arango_url, arango_user, arango_pass);

      // Create test user (ignore if exists)
      try {
        UserCreateRequest user_req;
        UserDataReply user_reply;
        user_req.set_uid("integration_test_user");
        user_req.set_name("Integration Test");
        user_req.set_email("test@test.com");
        db->userCreate(user_req, user_reply, log_context);
      } catch (...) {}

      // Configure the linkml engine in the global Config singleton
      SchemaAPIConfig linkml_config;
      linkml_config.base_url = schema_url;
      linkml_config.verify_ssl = false;
      linkml_config.connect_timeout_sec = 10;
      linkml_config.request_timeout_sec = 30;

      std::string token = getEnv("DATAFED_TEST_SCHEMA_API_TOKEN");
      if (!token.empty()) {
        linkml_config.bearer_token = token;
      }

      Config::getInstance().schemas["linkml"] = linkml_config;

      // Construct handler — picks up "linkml" from Config and registers
      // ExternalSchemaStorage + ExternalSchemaValidator
      handler = std::make_unique<SchemaHandler>(*db);
      available = true;

    } catch (std::exception &e) {
      BOOST_TEST_MESSAGE("LinkML fixture setup failed: " << e.what());
    }
  }

  ~LinkMLFixture() { cleanup(); }

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
      } catch (...) {}
    }
    created_schemas.clear();
  }

  std::string createTestSchema(
      const std::string &name,
      const std::string &def = VALID_LINKML_SCHEMA_DEF,
      const std::string &desc = "linkml integration test") {

    SchemaCreateRequest req;
    SchemaDataReply reply;

    req.set_id(name);
    req.set_def(def);
    req.set_desc(desc);
    req.set_pub(false);
    req.set_sys(false);
    req.set_type(LINKML_ENGINE);
    req.set_format(LINKML_FORMAT);

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

  /// Poll until ArangoSearch view catches up, or timeout.
  SchemaDataReply waitForSearchResults(const std::string &id_prefix,
                                       int min_expected,
                                       int max_attempts = 20,
                                       int interval_ms = 250) {
    SchemaSearchRequest search_req;
    SchemaDataReply search_reply;
    search_req.set_id(id_prefix);

    for (int attempt = 0; attempt < max_attempts; ++attempt) {
      search_reply.Clear();
      handler->handleSearch(TEST_USER, search_req, search_reply, log_context);

      if (search_reply.schema_size() >= min_expected) {
        return search_reply;
      }

      std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
    }

    return search_reply;
  }
};

#define REQUIRE_LINKML()                                                       \
  BOOST_REQUIRE_MESSAGE(isAvailable(),                                         \
      "LinkML tests not configured — set DATAFED_TEST_ARANGO_URL, "            \
      "DATAFED_TEST_ARANGO_USER, DATAFED_TEST_ARANGO_PASS, and "              \
      "DATAFED_TEST_SCHEMA_API_URL")

// ============================================================================
// Test Suite: LinkML Create
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(LinkMLCreate, LinkMLFixture)

BOOST_AUTO_TEST_CASE(create_valid_schema) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_create");
  BOOST_TEST(id.find("test_linkml_create:") != std::string::npos);
}

BOOST_AUTO_TEST_CASE(create_and_view_round_trip) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_view", VALID_LINKML_SCHEMA_DEF,
                                    "linkml round trip");

  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);

  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  BOOST_TEST(view_reply.schema(0).id() == id);
  BOOST_TEST(view_reply.schema(0).desc() == "linkml round trip");

  // Content should be hydrated from external storage
  std::string returned_def = view_reply.schema(0).def();
  BOOST_TEST(!returned_def.empty());

  // Should contain key LinkML fields from the original schema
  BOOST_TEST(returned_def.find("Experiment") != std::string::npos);
  BOOST_TEST(returned_def.find("sample_count") != std::string::npos);
  BOOST_TEST(returned_def.find("linkml:types") != std::string::npos);
}

BOOST_AUTO_TEST_CASE(create_with_invalid_yaml_throws) {
  REQUIRE_LINKML();

  SchemaCreateRequest req;
  SchemaDataReply reply;

  req.set_id("test_linkml_bad_yaml");
  req.set_def(INVALID_YAML);
  req.set_desc("should fail");
  req.set_pub(false);
  req.set_sys(false);
  req.set_type(LINKML_ENGINE);
  req.set_format(LINKML_FORMAT);

  BOOST_CHECK_THROW(
      handler->handleCreate(TEST_USER, req, reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_invalid_linkml_schema_throws) {
  REQUIRE_LINKML();

  SchemaCreateRequest req;
  SchemaDataReply reply;

  req.set_id("test_linkml_bad_schema");
  req.set_def(INVALID_LINKML_SCHEMA);
  req.set_desc("should fail - bad range reference");
  req.set_pub(false);
  req.set_sys(false);
  req.set_type(LINKML_ENGINE);
  req.set_format(LINKML_FORMAT);

  BOOST_CHECK_THROW(
      handler->handleCreate(TEST_USER, req, reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(create_with_description) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_desc", VALID_LINKML_SCHEMA_DEF,
                                    "detailed linkml description");

  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);

  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  BOOST_TEST(view_reply.schema(0).desc() == "detailed linkml description");
}

BOOST_AUTO_TEST_CASE(create_rolls_back_arango_on_storage_failure) {
  REQUIRE_LINKML();

  // Point config at a nonexistent service to force external storage failure
  auto &cfg = Config::getInstance().schemas["linkml"];
  std::string real_url = cfg.base_url;
  cfg.base_url = "http://localhost:1/v1";

  auto bad_handler = std::make_unique<SchemaHandler>(*db);

  SchemaCreateRequest req;
  SchemaDataReply reply;
  req.set_id("test_linkml_rollback");
  req.set_def(VALID_LINKML_SCHEMA_DEF);
  req.set_desc("should rollback");
  req.set_pub(false);
  req.set_sys(false);
  req.set_type(LINKML_ENGINE);
  req.set_format(LINKML_FORMAT);

  BOOST_CHECK_THROW(
      bad_handler->handleCreate(TEST_USER, req, reply, log_context),
      TraceException);

  // Restore config
  cfg.base_url = real_url;

  // Verify the Arango record was rolled back — view should throw
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id("test_linkml_rollback:0");

  try {
    handler->handleView(TEST_USER, view_req, view_reply, log_context);
    // If we got here, rollback didn't work — clean up manually
    created_schemas.push_back(view_reply.schema(0).id());
    BOOST_FAIL("Arango record should have been rolled back after storage failure");
  } catch (TraceException &) {
    // Expected — record was cleaned up by rollback
  }
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: LinkML Revise
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(LinkMLRevise, LinkMLFixture)

BOOST_AUTO_TEST_CASE(revise_creates_new_version_in_external_storage) {
  REQUIRE_LINKML();

  std::string id_v1 = createTestSchema("test_linkml_revise");

  SchemaReviseRequest rev_req;
  SchemaDataReply rev_reply;
  rev_req.set_id(id_v1);
  rev_req.set_def(UPDATED_LINKML_SCHEMA_DEF);
  rev_req.set_desc("revised linkml");

  handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context);

  BOOST_REQUIRE(rev_reply.schema_size() > 0);
  std::string id_v2 = rev_reply.schema(0).id();
  created_schemas.push_back(id_v2);

  BOOST_TEST(id_v2 != id_v1);

  // View new revision — content from external storage
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id_v2);

  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  std::string returned_def = view_reply.schema(0).def();
  BOOST_TEST(!returned_def.empty());
  // Updated schema should contain the new "unit" attribute
  BOOST_TEST(returned_def.find("unit") != std::string::npos);
}

BOOST_AUTO_TEST_CASE(revise_without_def_skips_validation_and_storage) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_revise_no_def");

  SchemaReviseRequest rev_req;
  SchemaDataReply rev_reply;
  rev_req.set_id(id);
  // Deliberately NOT setting def

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

BOOST_AUTO_TEST_CASE(revise_with_invalid_yaml_throws) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_revise_bad_yaml");

  SchemaReviseRequest rev_req;
  SchemaDataReply rev_reply;
  rev_req.set_id(id);
  rev_req.set_def(INVALID_YAML);

  BOOST_CHECK_THROW(
      handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(revise_with_invalid_linkml_throws) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_revise_bad_schema");

  SchemaReviseRequest rev_req;
  SchemaDataReply rev_reply;
  rev_req.set_id(id);
  rev_req.set_def(INVALID_LINKML_SCHEMA);

  BOOST_CHECK_THROW(
      handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: LinkML Update
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(LinkMLUpdate, LinkMLFixture)

BOOST_AUTO_TEST_CASE(update_description_only) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_upd_desc",
                                    VALID_LINKML_SCHEMA_DEF,
                                    "original");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_desc("updated description");

  handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);

  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);
  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  BOOST_TEST(view_reply.schema(0).desc() == "updated description");
}

BOOST_AUTO_TEST_CASE(update_definition_syncs_external_storage) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_upd_def");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_def(UPDATED_LINKML_SCHEMA_DEF);

  handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);

  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);
  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  std::string returned_def = view_reply.schema(0).def();
  BOOST_TEST(returned_def.find("unit") != std::string::npos);
}

BOOST_AUTO_TEST_CASE(update_without_def_skips_validation) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_upd_no_def");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_desc("description only update");

  try {
    handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);
  } catch (TraceException &e) {
    std::string msg = e.toString();
    BOOST_TEST(msg.find("Invalid metadata schema") == std::string::npos);
    BOOST_TEST(msg.find("Schema validation failed") == std::string::npos);
  }
}

BOOST_AUTO_TEST_CASE(update_with_invalid_yaml_throws) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_upd_bad_yaml");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_def(INVALID_YAML);

  BOOST_CHECK_THROW(
      handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_CASE(update_with_invalid_linkml_throws) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_upd_bad_schema");

  SchemaUpdateRequest upd_req;
  SchemaDataReply upd_reply;
  upd_req.set_id(id);
  upd_req.set_def(INVALID_LINKML_SCHEMA);

  BOOST_CHECK_THROW(
      handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context),
      TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: LinkML Delete
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(LinkMLDelete, LinkMLFixture)

BOOST_AUTO_TEST_CASE(delete_cleans_up_external_storage) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_delete");
  created_schemas.pop_back();

  SchemaDeleteRequest del_req;
  AckReply del_reply;
  del_req.set_id(id);

  BOOST_CHECK_NO_THROW(
      handler->handleDelete(TEST_USER, del_req, del_reply, log_context));

  // Verify gone from Arango
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);

  BOOST_CHECK_THROW(
      handler->handleView(TEST_USER, view_req, view_reply, log_context),
      TraceException);

  // Validate against deleted schema should return error, not crash
  std::string errors = handler->validateMetadataContent(
      id, VALID_LINKML_METADATA, log_context);
  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: LinkML Search
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(LinkMLSearch, LinkMLFixture)

BOOST_AUTO_TEST_CASE(search_finds_linkml_schemas) {
  REQUIRE_LINKML();

  createTestSchema("test_linkml_search_a");
  createTestSchema("test_linkml_search_b");

  SchemaDataReply search_reply = waitForSearchResults("test_linkml_search_", 2);

  BOOST_TEST(search_reply.schema_size() >= 2);
}

BOOST_AUTO_TEST_CASE(search_view_returns_external_content) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_search_view");

  SchemaDataReply search_reply = waitForSearchResults("test_linkml_search_view", 1);
  BOOST_REQUIRE(search_reply.schema_size() > 0);

  // View the schema — content should be hydrated from external storage
  SchemaViewRequest view_req;
  SchemaDataReply view_reply;
  view_req.set_id(id);

  handler->handleView(TEST_USER, view_req, view_reply, log_context);

  BOOST_REQUIRE(view_reply.schema_size() > 0);
  std::string returned_def = view_reply.schema(0).def();
  BOOST_TEST(!returned_def.empty());
  BOOST_TEST(returned_def.find("Experiment") != std::string::npos);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: LinkML Metadata Validation
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(LinkMLMetadataValidation, LinkMLFixture)

BOOST_AUTO_TEST_CASE(valid_metadata_passes) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_val_pass");

  std::string errors = handler->validateMetadataContent(
      id, VALID_LINKML_METADATA, log_context);

  BOOST_TEST(errors.empty());
}

BOOST_AUTO_TEST_CASE(missing_required_field_fails) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_val_missing");

  std::string errors = handler->validateMetadataContent(
      id, INVALID_LINKML_METADATA_MISSING_REQUIRED, log_context);

  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(wrong_type_fails) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_val_type");

  std::string errors = handler->validateMetadataContent(
      id, INVALID_LINKML_METADATA_WRONG_TYPE, log_context);

  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(nonexistent_schema_returns_error) {
  REQUIRE_LINKML();

  std::string errors = handler->validateMetadataContent(
      "does_not_exist:99", VALID_LINKML_METADATA, log_context);

  BOOST_TEST(!errors.empty());
}

BOOST_AUTO_TEST_CASE(handle_metadata_validate_sets_errors_on_failure) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_hmv_fail");

  MetadataValidateRequest req;
  MetadataValidateReply reply;
  req.set_sch_id(id);
  req.set_metadata(INVALID_LINKML_METADATA_MISSING_REQUIRED);

  handler->handleMetadataValidate(TEST_USER, req, reply, log_context);

  BOOST_TEST(!reply.errors().empty());
}

BOOST_AUTO_TEST_CASE(handle_metadata_validate_no_errors_on_success) {
  REQUIRE_LINKML();

  std::string id = createTestSchema("test_linkml_hmv_pass");

  MetadataValidateRequest req;
  MetadataValidateReply reply;
  req.set_sch_id(id);
  req.set_metadata(VALID_LINKML_METADATA);

  handler->handleMetadataValidate(TEST_USER, req, reply, log_context);

  BOOST_TEST(reply.errors().empty());
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: LinkML Full Lifecycle
// ============================================================================

BOOST_FIXTURE_TEST_SUITE(LinkMLLifecycle, LinkMLFixture)

BOOST_AUTO_TEST_CASE(create_validate_update_revise_delete) {
  REQUIRE_LINKML();

  // 1. Create
  std::string id = createTestSchema("test_linkml_lifecycle",
                                    VALID_LINKML_SCHEMA_DEF,
                                    "lifecycle v1");

  // 2. Validate good metadata
  {
    std::string errors = handler->validateMetadataContent(
        id, VALID_LINKML_METADATA, log_context);
    BOOST_TEST(errors.empty());
  }

  // 3. Validate bad metadata
  {
    std::string errors = handler->validateMetadataContent(
        id, INVALID_LINKML_METADATA_MISSING_REQUIRED, log_context);
    BOOST_TEST(!errors.empty());
  }

  // 4. Update description
  {
    SchemaUpdateRequest upd_req;
    SchemaDataReply upd_reply;
    upd_req.set_id(id);
    upd_req.set_desc("lifecycle v1 updated");

    handler->handleUpdate(TEST_USER, upd_req, upd_reply, log_context);
  }

  // 5. View and verify update
  {
    SchemaViewRequest view_req;
    SchemaDataReply view_reply;
    view_req.set_id(id);
    handler->handleView(TEST_USER, view_req, view_reply, log_context);

    BOOST_REQUIRE(view_reply.schema_size() > 0);
    BOOST_TEST(view_reply.schema(0).desc() == "lifecycle v1 updated");
  }

  // 6. Revise with new definition
  std::string id_v2;
  {
    SchemaReviseRequest rev_req;
    SchemaDataReply rev_reply;
    rev_req.set_id(id);
    rev_req.set_def(UPDATED_LINKML_SCHEMA_DEF);
    rev_req.set_desc("lifecycle v2");

    handler->handleRevise(TEST_USER, rev_req, rev_reply, log_context);

    BOOST_REQUIRE(rev_reply.schema_size() > 0);
    id_v2 = rev_reply.schema(0).id();
    created_schemas.push_back(id_v2);

    BOOST_TEST(id_v2 != id);
  }

  // 7. Validate metadata against new revision — should still pass
  //    since we only added an optional "unit" field
  {
    std::string errors = handler->validateMetadataContent(
        id_v2, VALID_LINKML_METADATA, log_context);
    BOOST_TEST(errors.empty());
  }

  // 8. Delete both versions
  {
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
