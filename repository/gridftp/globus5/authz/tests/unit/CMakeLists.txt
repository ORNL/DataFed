# Each test listed in Alphabetical order
foreach(PROG
    test_Config
)

  include_directories(${CMAKE_SOURCE_DIR}/repository/gridftp/globus5/authz/source)
  file(GLOB ${PROG}_SOURCES ${PROG}.cpp)
  add_executable(unit_${PROG} ${${PROG}_SOURCES})
  target_link_libraries(unit_${PROG} Boost::unit_test_framework common -lzmq -lprotobuf -lpthread)
  target_compile_definitions(unit_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  add_test(unit_${PROG} unit_${PROG})
   
endforeach(PROG)

