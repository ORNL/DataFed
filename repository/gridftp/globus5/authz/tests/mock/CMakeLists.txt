

configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock_start.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/mock_start.sh 
  COPYONLY)


configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock_stop.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/mock_stop.sh 
  COPYONLY)

# Each test listed in Alphabetical order
foreach(PROG
    test_getVersion
)

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(mock_liveness_${PROG} ${${PROG}_SOURCES})

  target_link_libraries(mock_liveness_${PROG} PUBLIC datafed-authz ${DATAFED_BOOST_LIBRARIES} ${DATAFED_GSSAPI_LIBRARIES} ${DATAFED_GLOBUS_COMMON_LIBRARIES})
  target_include_directories(mock_liveness_${PROG}  PRIVATE ${DataFed_SOURCE_DIR}/repository/gridftp/globus5/authz/source)
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(mock_liveness_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()
  add_test(mock_liveness_${PROG} mock_liveness_${PROG})

	add_test(NAME start_mock
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock_start.sh
      WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/repository/gridftp/globus5/authz/mock_core
	)

	# Add a custom target to stop the server
	add_test(NAME stop_mock
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock_stop.sh
      WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/repository/gridftp/globus5/authz/mock_core
	)

  set_tests_properties(start_mock PROPERTIES FIXTURES_SETUP FIX_MOCK)
  set_tests_properties(stop_mock PROPERTIES FIXTURES_CLEANUP FIX_MOCK)

  set_tests_properties(mock_liveness_${PROG} PROPERTIES FIXTURES_REQUIRED FIX_MOCK)

endforeach(PROG)
