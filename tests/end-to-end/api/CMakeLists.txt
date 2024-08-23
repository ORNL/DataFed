cmake_minimum_required (VERSION 3.17.0)
# 3.7.0 requires to use test fixtures

if( ENABLE_END_TO_END_API_TESTS )
  add_test(NAME end_to_end_setup COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/setup.sh")
  add_test(NAME end_to_end_user_login COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/test_api_user_login.py")
  add_test(NAME end_to_end_context COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/test_api_context.py")
  add_test(NAME end_to_end_endpoint COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/test_api_endpoint.py")
  add_test(NAME end_to_end_repo COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/test_api_repo.py")
  add_test(NAME end_to_end_alloc COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/test_api_alloc.py")
  add_test(NAME end_to_end_collection COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/test_api_collection.py")
  add_test(NAME end_to_end_record COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/test_api_record.py")

  # Note because these tests are all using the same database we cannot run most of them concurrently
  # They must be run sequentially so that concurrent API calls do not create problems
  set_tests_properties(end_to_end_setup PROPERTIES FIXTURES_SETUP FIX_SETUP)
  set_tests_properties(end_to_end_user_login PROPERTIES FIXTURES_REQUIRED FIX_SETUP)
  set_tests_properties(end_to_end_user_login PROPERTIES FIXTURES_SETUP FIX_LOGIN)
  set_tests_properties(end_to_end_context PROPERTIES FIXTURES_REQUIRED FIX_LOGIN)
  set_tests_properties(end_to_end_endpoint PROPERTIES FIXTURES_REQUIRED FIX_LOGIN)

  # The following must be run sequentially
  set_tests_properties(end_to_end_repo PROPERTIES FIXTURES_REQUIRED FIX_LOGIN)
  set_tests_properties(end_to_end_repo PROPERTIES FIXTURES_SETUP FIX_REPO)
  set_tests_properties(end_to_end_alloc PROPERTIES FIXTURES_REQUIRED FIX_REPO)
  set_tests_properties(end_to_end_alloc PROPERTIES FIXTURES_SETUP FIX_ALLOC)
  set_tests_properties(end_to_end_collection PROPERTIES FIXTURES_REQUIRED FIX_ALLOC)
  set_tests_properties(end_to_end_record PROPERTIES FIXTURES_REQUIRED FIX_ALLOC)

endif()
