cmake_minimum_required (VERSION 3.17.0)
# 3.7.0 requires to use test fixtures

message("TESTING: DATAFED_DOMAIN : ${DATAFED_DOMAIN}")

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/auth.setup.js.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/auth.setup.js"
  @ONLY
)

#FIXTHIS
# For E2E web ui test
if(ENABLE_END_TO_END_WEB_TESTS)
  add_custom_target(end_to_end_web_tests 
    COMMAND npx playwright test
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    COMMENT "Running Playwright tests"
  )

  # Note because these tests are all using the same database we cannot run most of them concurrently
  # They must be run sequentially so that concurrent API calls do not create problems
  # set_tests_properties(end_to_end_setup PROPERTIES FIXTURES_SETUP FIX_SETUP)


  # The following must be run sequentially
  # set_tests_properties(end_to_end_repo PROPERTIES FIXTURES_REQUIRED FIX_LOGIN)


endif()
