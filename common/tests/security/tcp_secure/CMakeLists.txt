
include_directories(${CMAKE_SOURCE_DIR}/common/source)
add_executable(test_tcp_secure_client test_tcp_secure_client.cpp)

# Only needed if boost is shared and not static
if(BUILD_SHARED_LIBS)
  target_compile_definitions(test_tcp_secure_client PRIVATE BOOST_TEST_DYN_LINK)
  target_link_libraries(test_tcp_secure_client ${DATAFED_BOOST_LIBRARIES} common libzmq protobuf::libprotobuf Threads::Threads)
else()
  target_link_libraries(test_tcp_secure_client ${DATAFED_BOOST_LIBRARIES} common libzmq-static protobuf::libprotobuf Threads::Threads)
endif()

add_executable(test_tcp_secure_server test_tcp_secure_server.cpp)
# Only needed if boost is shared and not static
if(BUILD_SHARED_LIBS)
  target_link_libraries(test_tcp_secure_server ${DATAFED_BOOST_LIBRARIES} common libzmq protobuf::libprotobuf Threads::Threads)
  target_compile_definitions(test_tcp_secure_server PRIVATE BOOST_TEST_DYN_LINK)
else()
  target_link_libraries(test_tcp_secure_server ${DATAFED_BOOST_LIBRARIES} common libzmq-static protobuf::libprotobuf Threads::Threads)
endif()

find_program(TCPDUMP_CMD NAMES tcpdump)
find_program(TIMEOUT_CMD NAMES timeout)

if(TCPDUMP_CMD)
  if( TIMEOUT_CMD ) 
    configure_file(${CMAKE_CURRENT_SOURCE_DIR}/test_tcp_insecure.sh
      ${CMAKE_CURRENT_BINARY_DIR}/test_tcp_insecure.sh COPYONLY)
    configure_file(${CMAKE_CURRENT_SOURCE_DIR}/test_tcp_secure.sh
      ${CMAKE_CURRENT_BINARY_DIR}/test_tcp_secure.sh COPYONLY)
    add_test(NAME test_tcp_secure 
      COMMAND ${CMAKE_COMMAND} -P ${CMAKE_CURRENT_SOURCE_DIR}/runtests.cmake
      ${CMAKE_CURRENT_BINARY_DIR})
  else()
    message("-- timeout was not found skipping security test 'test_tcp_secure'")
  endif()
else()
  message("-- tcpdump was not found skipping security test 'test_tcp_secure'")
endif()
