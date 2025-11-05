cmake_minimum_required (VERSION 3.17.0)
# 3.7.0 requires to use test fixtures

if( ENABLE_INTEGRATION_TESTS )
  # Each test listed in Alphabetical order
  foreach(PROG
      test_CommandLib
      test_MessageLib
  )
  
    add_test(NAME integration_${PROG}
      COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/${PROG}.py"
        WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/tests/mock_core
    )

    set_tests_properties(integration_${PROG} PROPERTIES ENVIRONMENT "PYTHONPATH=${DataFed_SOURCE_DIR}/python/datafed_pkg")
    set_tests_properties(integration_${PROG} PROPERTIES FIXTURES_REQUIRED FIX_MOCK)
  
  endforeach(PROG)
endif()
