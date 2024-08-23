cmake_minimum_required (VERSION 3.17.0)
# 3.7.0 requires to use test fixtures

message("TESTING: DATAFED_DOMAIN : ${DATAFED_DOMAIN}")

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/DataFed_config.json.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/DataFed_config.json"
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

endif()
