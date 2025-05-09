cmake_minimum_required (VERSION 3.17.0)
# 3.7.0 requires to use test fixtures
configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/api/version_router.js.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/api/version_router.js"
  @ONLY)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/manifest.json.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/foxx/manifest.json"
  @ONLY)

if( ENABLE_FOXX_TESTS )
  add_test(NAME foxx_setup COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_setup.sh")
  add_test(NAME foxx_teardown COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_teardown.sh")
  add_test(NAME foxx_version COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "version")
  add_test(NAME foxx_support COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "support")

  set_tests_properties(foxx_setup PROPERTIES FIXTURES_SETUP Foxx)
  set_tests_properties(foxx_teardown PROPERTIES FIXTURES_CLEANUP Foxx)
  set_tests_properties(foxx_version PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_support PROPERTIES FIXTURES_REQUIRED Foxx)
endif()
