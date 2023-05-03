cmake_minimum_required (VERSION 3.7.0)
# 3.7.0 requires to use test fixtures
configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/api/version_router.js.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/api/version_router.js"
  @ONLY)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/manifest.json.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/manifest.json"
  @ONLY)

message("ENABLE FOX TEST ${ENABLE_FOXX_TESTS}")
if( ENABLE_FOXX_TESTS )
  message("Adding tests")
  add_test(NAME foxx_setup COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_setup.sh")
  add_test(NAME foxx_teardown COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_teardown.sh")
  add_test(NAME foxx_version COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_version.sh")

  set_tests_properties(foxx_setup PROPERTIES FIXTURES_SETUP Foxx)
  set_tests_properties(foxx_teardown PROPERTIES FIXTURES_CLEANUP Foxx)
  set_tests_properties(foxx_version PROPERTIES FIXTURES_REQUIRED Foxx)
endif()
