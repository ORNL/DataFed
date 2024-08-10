# Path to the script
set(SCRIPT_PATH "${CMAKE_SOURCE_DIR}/common/tests/unit/http_server.sh")
# Execute the script
execute_process(
    COMMAND /bin/bash ${SCRIPT_PATH}
    RESULT_VARIABLE result
    OUTPUT_VARIABLE output
    ERROR_VARIABLE error_output
    TIMEOUT 60
)

# Check if the script executed successfully
if(NOT result EQUAL 0)
    message(FATAL_ERROR "Failed to execute ${SCRIPT_PATH}. Output: ${output}. Error: ${error_output}")
endif()

foreach(PROG
    test_Buffer
    test_CommunicatorFactory
    test_CredentialFactory
    test_Frame
    test_DynaLog
    test_Value
    test_MessageFactory
    test_OperatorFactory
    test_ProtoBufFactory
    test_ProtoBufMap
    test_Proxy
    test_ProxyBasicZMQ
    test_SocketFactory
    test_SocketOptions
)

  include_directories(${PROJECT_SOURCE_DIR}/common/source)
  file(GLOB ${PROG}_SOURCES ${PROG}.cpp)
  add_executable(unit_${PROG} ${${PROG}_SOURCES})
  if(BUILD_SHARED_LIBS)
    target_link_libraries(unit_${PROG} PRIVATE ${DATAFED_BOOST_LIBRARIES}
      common libzmq protobuf::libprotobuf Threads::Threads) 
    target_compile_definitions(unit_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  else()
    target_link_libraries(unit_${PROG} PRIVATE ${DATAFED_BOOST_LIBRARIES}
      common libzmq-static protobuf::libprotobuf Threads::Threads) 
  endif()

  # Add the test
  add_test(NAME unit_${PROG} COMMAND unit_${PROG})

endforeach(PROG)
