# ============================================================================
# Integration Tests
# ============================================================================

# ── Options ──────────────────────────────────────────────────────────────────

set(MOCK_SCHEMA_IMAGE "savannah.ornl.gov/datafed/mock-schema:latest"
    CACHE STRING "Docker image for the mock Schema API (Prism)")
set(MOCK_SCHEMA_PORT "4010"
    CACHE STRING "Host port for the mock Schema API container")
set(MOCK_SCHEMA_PULL "true"
    CACHE STRING "Pull the mock image before starting (set to 'false' for offline/local builds)")

# ── Check for Docker (needed by SchemaAPIClient tests) ───────────────────────

find_program(DOCKER_EXECUTABLE docker)
if(NOT DOCKER_EXECUTABLE)
  message(STATUS "Docker not found — SchemaAPIClient integration tests will be skipped")
endif()

# ── Compile and register all integration tests ──────────────────────────────

foreach(PROG
    test_SchemaServiceFactory
    test_SchemaAPIClient
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

  set(_mock_schema_env
    "MOCK_SCHEMA_IMAGE=${MOCK_SCHEMA_IMAGE}"
    "MOCK_SCHEMA_PORT=${MOCK_SCHEMA_PORT}"
    "MOCK_SCHEMA_PULL=${MOCK_SCHEMA_PULL}"
    "CONTAINER_NAME=datafed-mock-schema"
  )

  set(_test_env
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
    ENVIRONMENT       "${_test_env}"
    LABELS            "integration"
  )

  if(ENABLE_MEMORY_TESTS)
    set_tests_properties(memory_test_SchemaAPIClient PROPERTIES
      FIXTURES_REQUIRED MockSchemaAPI
      ENVIRONMENT       "${_test_env}"
      LABELS            "integration;memory"
    )
  endif()

endif()
