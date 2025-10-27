
if( ENABLE_INTEGRATION_TESTS )

  configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock/mock_start.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_start.sh 
  COPYONLY)

  configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock/mock_stop.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_stop.sh 
  COPYONLY)

	add_test(NAME start_mock
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_start.sh
      WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/tests/mock_core
	)

  set(DATAFED_MOCK_CORE_PUB_KEY "${CMAKE_BINARY_DIR}/tests/mock_core/mock-datafed-core-key.pub" PARENT_SCOPE)

	# Add a custom target to stop the server
	add_test(NAME stop_mock
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_stop.sh
      WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/tests/mock_core
	)

  set_tests_properties(start_mock PROPERTIES FIXTURES_SETUP FIX_MOCK)
  set_tests_properties(stop_mock PROPERTIES FIXTURES_CLEANUP FIX_MOCK)

  add_subdirectory(mock_core)
  add_subdirectory(mock)
endif()

if (ENABLE_END_TO_END_TESTS)
	if (NOT ENABLE_END_TO_END_API_TESTS AND NOT ENABLE_END_TO_END_WEB_TESTS)
    message (FATAL_ERROR "Cannot run end-to-end tests because one of the ENABLE_END_TO_END web or API flag is not on")
  else()
    add_subdirectory(end-to-end)
    add_subdirectory(end-to-end/web-UI)
  endif()
else()
  if (ENABLE_END_TO_END_API_TESTS)
    if (BUILD_PYTHON_CLIENT)
      add_subdirectory(end-to-end)
    else()
      message (FATAL_ERROR "Cannot run end-to-end tests because BUILD_PYTHON_CLIENT is not on")
    endif()
  endif()
  if (ENABLE_END_TO_END_WEB_TESTS)
    add_subdirectory(end-to-end/web-UI)
  endif()
endif()


