if( ENABLE_UNIT_TESTS )

  configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock/mock_start.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_start.sh 
  COPYONLY)

  configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock/mock_stop.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_stop.sh 
  COPYONLY)

	add_test(NAME start_mock
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_start.sh
      WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/repository/gridftp/globus5/authz/mock_core
	)

	# Add a custom target to stop the server
	add_test(NAME stop_mock
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_stop.sh
      WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/repository/gridftp/globus5/authz/mock_core
	)

  set_tests_properties(start_mock PROPERTIES FIXTURES_SETUP FIX_MOCK)
  set_tests_properties(stop_mock PROPERTIES FIXTURES_CLEANUP FIX_MOCK)

  add_subdirectory(unit)
  add_subdirectory(integration)
  add_subdirectory(mock)
endif()
