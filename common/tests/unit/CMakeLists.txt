# Each test listed in Alphabetical order
foreach(PROG
    test_Buffer
    test_CommunicatorFactory
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
  # Only want this if using shared boost libraries
  if ( ENABLE_UNIT_TESTS )
    add_test(unit_${PROG} unit_${PROG})
  endif( ENABLE_UNIT_TESTS )
  if ( ENABLE_MEMORY_TESTS )
    add_test(NAME memory_${PROG} COMMAND valgrind  --leak-check=full --error-exitcode=1 $<TARGET_FILE:unit_${PROG}>)
  endif( ENABLE_MEMORY_TESTS )
endforeach(PROG)

