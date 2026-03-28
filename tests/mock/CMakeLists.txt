

# Each test listed in Alphabetical order
foreach(PROG
    test_getVersion
)

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(mock_liveness_${PROG} ${${PROG}_SOURCES})

  target_link_libraries(mock_liveness_${PROG} PUBLIC ${DATAFED_BOOST_LIBRARIES} common )
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(mock_liveness_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()

  # Run the test from the same folder as the mock server so that the 
  # public key is visble
	add_test(NAME mock_liveness_${PROG} 
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock_liveness_${PROG} 
      WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/tests/mock_core
	)
  set_tests_properties(mock_liveness_${PROG} PROPERTIES FIXTURES_REQUIRED FIX_MOCK LABELS "integration")

endforeach(PROG)
