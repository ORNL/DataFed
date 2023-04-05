
include_directories(${CMAKE_SOURCE_DIR}/common/source)
add_executable(end_to_end_test_tcp_secure_client test_tcp_secure_client.cpp)
target_link_libraries(end_to_end_test_tcp_secure_client Boost::unit_test_framework common -lzmq -lprotobuf -lpthread)
target_compile_definitions(end_to_end_test_tcp_secure_client PRIVATE BOOST_TEST_DYN_LINK)

add_executable(end_to_end_test_tcp_secure_server test_tcp_secure_server.cpp)
target_link_libraries(end_to_end_test_tcp_secure_server Boost::unit_test_framework common -lzmq -lprotobuf -lpthread)
target_compile_definitions(end_to_end_test_tcp_secure_server PRIVATE BOOST_TEST_DYN_LINK)

add_test(NAME end_to_end_test_tcp_secure 
  COMMAND ${CMAKE_COMMAND} -P ${CMAKE_CURRENT_SOURCE_DIR}/runtests.cmake
  ${CMAKE_CURRENT_BINARY_DIR})
