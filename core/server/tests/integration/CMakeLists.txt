# ============================================================================
# Integration Tests
# ============================================================================

# ── Options ──────────────────────────────────────────────────────────────────

set(MOCK_SCHEMA_IMAGE "savannah.ornl.gov/datafed/mock-schema:latest"
    CACHE STRING "Docker image for the mock Schema API (Prism)")
set(MOCK_SCHEMA_PORT "4011"
    CACHE STRING "Host port for the mock Schema API container")
set(MOCK_SCHEMA_PULL "true"
    CACHE STRING "Pull the mock image before starting (set to 'false' for offline/local builds)")

set(ARANGO_IMAGE "savannah.ornl.gov/datafed/arango-foxx:latest"
    CACHE STRING "Docker image for the ArangoDB test instance (with Foxx services)")
set(ARANGO_PORT "8529"
    CACHE STRING "Host port for the ArangoDB test container")
set(ARANGO_ROOT_PASS "test"
    CACHE STRING "Root password for the ArangoDB test instance")
set(ARANGO_PULL "true"
    CACHE STRING "Pull the ArangoDB image before starting (set to 'false' for offline/local builds)")
set(DATAFED_TEST_DATABASE_NAME "sdms_test"
    CACHE STRING "Database name for integration tests (default: sdms_test)")

set(DATAFED_TEST_SCHEMA_API_URL "http://0.0.0.0:8080"
    CACHE STRING "Url to LinkML Schema")
set(DATAFED_TEST_SCHEMA_API_TOKEN "testy"
    CACHE STRING "Token for LinkML Schema Service")

# ── Check for Docker (needed by SchemaAPIClient tests) ───────────────────────

find_program(DOCKER_EXECUTABLE docker)
if(NOT DOCKER_EXECUTABLE)
  message(STATUS "Docker not found — integration tests requiring containers will be skipped")
endif()

# ── Compile and register all integration tests ──────────────────────────────

foreach(PROG
    test_SchemaServiceFactory
    test_SchemaAPIClient
    test_SchemaHandlerJson
    test_SchemaHandlerLinkML
)
  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(integration_${PROG} ${${PROG}_SOURCES})
  target_link_libraries(integration_${PROG} PUBLIC datafed-core-lib ${DATAFED_BOOST_LIBRARIES})
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(integration_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()
  if(ENABLE_UNIT_TESTS)
    add_test(integration_${PROG} integration_${PROG})
  endif(ENABLE_UNIT_TESTS)
  if(ENABLE_MEMORY_TESTS)
    add_test(NAME memory_${PROG} COMMAND valgrind --leak-check=full --error-exitcode=1 $<TARGET_FILE:integration_${PROG}>)
  endif(ENABLE_MEMORY_TESTS)
endforeach(PROG)

# ── Docker fixture for SchemaAPIClient ───────────────────────────────────────
#
# CTest fixtures: a setup test starts the container, a cleanup test stops it,
# and the actual test declares FIXTURES_REQUIRED so CTest enforces ordering.
# If Docker is not found, the test binary still compiles but the fixture tests
# are not registered — CTest will skip tests with unsatisfied fixture deps.
#
# Prism config:
#   PRISM_ERRORS=true   — rejects requests that violate the OpenAPI spec
#   PRISM_DYNAMIC=false — returns spec examples, not random data
# ============================================================================

if(DOCKER_EXECUTABLE)

  # ========================================================================
  # Mock Schema API (Prism) fixture — used by SchemaAPIClient
  # ========================================================================

  set(_mock_schema_env
    "MOCK_SCHEMA_IMAGE=${MOCK_SCHEMA_IMAGE}"
    "MOCK_SCHEMA_PORT=${MOCK_SCHEMA_PORT}"
    "MOCK_SCHEMA_PULL=${MOCK_SCHEMA_PULL}"
    "CONTAINER_NAME=datafed-mock-schema"
  )

  set(_mock_schema_test_env
    "SCHEMA_API_TEST_URL=http://localhost:${MOCK_SCHEMA_PORT}"
  )

  # ── Fixture setup: start Prism container ─────────────────────────────

  add_test(
    NAME mock_schema_start
    COMMAND bash ${CMAKE_CURRENT_SOURCE_DIR}/start_mock_schema.sh
  )
  set_tests_properties(mock_schema_start PROPERTIES
    FIXTURES_SETUP    MockSchemaAPI
    ENVIRONMENT       "${_mock_schema_env}"
    LABELS            "fixture;integration"
  )

  # ── Fixture cleanup: stop and remove container ───────────────────────

  add_test(
    NAME mock_schema_stop
    COMMAND bash ${CMAKE_CURRENT_SOURCE_DIR}/stop_mock_schema.sh
  )
  set_tests_properties(mock_schema_stop PROPERTIES
    FIXTURES_CLEANUP  MockSchemaAPI
    ENVIRONMENT       "${_mock_schema_env}"
    LABELS            "fixture;integration"
  )

  # ── Attach fixture to SchemaAPIClient tests ──────────────────────────

  set_tests_properties(integration_test_SchemaAPIClient PROPERTIES
    FIXTURES_REQUIRED MockSchemaAPI
    ENVIRONMENT       "${_mock_schema_test_env}"
    LABELS            "integration"
  )

  if(ENABLE_MEMORY_TESTS)
    set_tests_properties(memory_test_SchemaAPIClient PROPERTIES
      FIXTURES_REQUIRED MockSchemaAPI
      ENVIRONMENT       "${_mock_schema_test_env}"
      LABELS            "integration;memory"
    )
  endif()

  # ========================================================================
  # ArangoDB fixture — used by SchemaHandler
  # ========================================================================

  set(_arango_env
    "ARANGO_IMAGE=${ARANGO_IMAGE}"
    "ARANGO_PORT=${ARANGO_PORT}"
    "ARANGO_ROOT_PASS=${ARANGO_ROOT_PASS}"
    "ARANGO_CONTAINER=datafed-test-arango"
    "ARANGO_PULL=${ARANGO_PULL}"
    "DATAFED_PROJECT_ROOT=${DataFed_SOURCE_DIR}"
    "DATAFED_DATABASE_NAME=${DATAFED_TEST_DATABASE_NAME}"
  )
  set(_arango_test_env
    "DATAFED_TEST_ARANGO_URL=http://localhost:${ARANGO_PORT}/_db/${DATAFED_TEST_DATABASE_NAME}/api/${DATAFED_FOXX_MAJOR}/"
    "DATAFED_TEST_ARANGO_USER=root"
    "DATAFED_TEST_ARANGO_PASS=${ARANGO_ROOT_PASS}"
    "DATAFED_DATABASE_NAME=${ARANGO_TEST_DATABASE_NAME}"
  )
  set(_linkml_test_env
    "DATAFED_TEST_ARANGO_URL=http://localhost:${ARANGO_PORT}/_db/${DATAFED_TEST_DATABASE_NAME}/api/${DATAFED_FOXX_MAJOR}/"
    "DATAFED_TEST_ARANGO_USER=root"
    "DATAFED_TEST_ARANGO_PASS=${ARANGO_ROOT_PASS}"
    "DATAFED_DATABASE_NAME=${ARANGO_TEST_DATABASE_NAME}"
    "DATAFED_TEST_SCHEMA_API_URL=${DATAFED_TEST_SCHEMA_API_URL}"
    "DATAFED_TEST_SCHEMA_API_TOKEN=${DATAFED_TEST_SCHEMA_API_TOKEN}"
  )

  # ── Fixture setup: start ArangoDB container ──────────────────────────

  add_test(
    NAME arango_start
    COMMAND bash ${CMAKE_CURRENT_SOURCE_DIR}/start_test_arango.sh
  )
  set_tests_properties(arango_start PROPERTIES
    FIXTURES_SETUP    TestArangoDB
    ENVIRONMENT       "${_arango_env}"
    LABELS            "fixture;integration"
  )

  # ── Fixture cleanup: stop and remove container ───────────────────────

  add_test(
    NAME arango_stop
    COMMAND bash ${CMAKE_CURRENT_SOURCE_DIR}/stop_test_arango.sh
  )
  set_tests_properties(arango_stop PROPERTIES
    FIXTURES_CLEANUP  TestArangoDB
    ENVIRONMENT       "${_arango_env}"
    LABELS            "fixture;integration"
  )

  # ── Attach fixture to SchemaHandler tests ────────────────────────────

  set_tests_properties(integration_test_SchemaHandlerJson PROPERTIES
    FIXTURES_REQUIRED TestArangoDB
    ENVIRONMENT       "${_arango_test_env}"
    LABELS            "integration"
  )
  set_tests_properties(integration_test_SchemaHandlerLinkML PROPERTIES
    FIXTURES_REQUIRED TestArangoDB
    ENVIRONMENT       "${_linkml_test_env}"
    LABELS            "integration"
  )

  if(ENABLE_MEMORY_TESTS)
    set_tests_properties(memory_test_SchemaHandlerJson PROPERTIES
      FIXTURES_REQUIRED TestArangoDB
      ENVIRONMENT       "${_arango_test_env}"
      LABELS            "integration;memory"
    )
    set_tests_properties(memory_test_SchemaHandlerLinkML PROPERTIES
      FIXTURES_REQUIRED TestArangoDB
      ENVIRONMENT       "${_linkml_test_env}"
      LABELS            "integration;memory"
    )
  endif()

endif()
