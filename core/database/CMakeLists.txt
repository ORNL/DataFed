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
  add_test(NAME foxx_authz COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_authz")
  add_test(NAME foxx_record COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_record")
  add_test(NAME foxx_repo COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_repo")
  add_test(NAME foxx_validation_repo COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_validation_repository")
  add_test(NAME foxx_path COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_path")
  add_test(NAME foxx_db_fixtures COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_fixture_setup.sh")
  add_test(NAME foxx_version COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_version")
  add_test(NAME foxx_support COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_support")
  add_test(NAME foxx_user_router COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_user_router")
  add_test(NAME foxx_data_router COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_data_router")
  add_test(NAME foxx_authz_router COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_authz_router")
  add_test(NAME foxx_unit_user_token COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_user_token")
  add_test(NAME foxx_unit_user_model COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_user_model")
  add_test(NAME foxx_unit_globus_collection_model COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_globus_collection_model")
  add_test(NAME foxx_unit_globus_token_model COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_globus_token_model")

  set_tests_properties(foxx_setup PROPERTIES FIXTURES_SETUP Foxx)
  set_tests_properties(foxx_teardown PROPERTIES FIXTURES_CLEANUP Foxx)
  set_tests_properties(foxx_db_fixtures PROPERTIES FIXTURES_SETUP FoxxDBFixtures FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_version PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_support PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_authz PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_authz_router PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_record PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_repo PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_validation_repo PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_path PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_user_router PROPERTIES FIXTURES_REQUIRED "Foxx;FoxxDBFixtures")
  set_tests_properties(foxx_data_router PROPERTIES FIXTURES_REQUIRED "Foxx;FoxxDBFixtures")
  set_tests_properties(foxx_unit_user_token PROPERTIES FIXTURES_REQUIRED Foxx)
  set_tests_properties(foxx_unit_user_model PROPERTIES FIXTURES_REQUIRED "Foxx;FoxxDBFixtures")
  set_tests_properties(foxx_unit_globus_collection_model PROPERTIES FIXTURES_REQUIRED "Foxx;FoxxDBFixtures")
  set_tests_properties(foxx_unit_globus_token_model PROPERTIES FIXTURES_REQUIRED "Foxx;FoxxDBFixtures")
endif()
