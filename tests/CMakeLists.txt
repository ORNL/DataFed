
if( BUILD_MOCK_CORE AND NOT BUILD_COMMON )
  message(FATAL_ERROR "BUILD_MOCK_CORE is enabled but build common is disabled, if you wish to build the mock core executable please enable BUILD_COMMON.")
endif()

if( INSTALL_MOCK_CORE_SERVER AND NOT BUILD_MOCK_CORE )
  message(FATAL_ERROR "INSTALL_MOCK_CORE_SERVER is enabled but BUILD_MOCK_CORE_SERVER is disabled, if you wish to install the mock core server executable please enable BUILD_MOCK_CORE_SERVER.")
endif()

if( BUILD_MOCK_CORE AND BUILD_COMMON )
  add_subdirectory(mock_core/source)
  install( TARGETS datafed-mock-core DESTINATION ${DATAFED_INSTALL_PATH}/tests/mock_core/source )
endif()

if( ENABLE_INTEGRATION_TESTS )
  if( BUILD_COMMON )
    configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock/mock_start.sh
    ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_start.sh
    COPYONLY)

    configure_file(${CMAKE_CURRENT_SOURCE_DIR}/mock/mock_stop.sh
    ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_stop.sh
    COPYONLY)

    add_test(NAME start_mock
      COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_start.sh
        WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/tests/mock_core/source
    )

    set(DATAFED_MOCK_CORE_PUB_KEY "${CMAKE_BINARY_DIR}/tests/mock_core/source/mock-datafed-core-key.pub" PARENT_SCOPE)

    # Add a custom target to stop the server
    add_test(NAME stop_mock
      COMMAND ${CMAKE_CURRENT_BINARY_DIR}/mock/mock_stop.sh
        WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/tests/mock_core/source
    )

    set_tests_properties(start_mock PROPERTIES FIXTURES_SETUP FIX_MOCK)
    set_tests_properties(stop_mock PROPERTIES FIXTURES_CLEANUP FIX_MOCK)

    add_subdirectory(mock)
  else()
    message(WARNING "Integration tests are enabled but build common is disabled, if you wish to run the full suite of integration tests you will need to enable building the common library.")
  endif()
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


