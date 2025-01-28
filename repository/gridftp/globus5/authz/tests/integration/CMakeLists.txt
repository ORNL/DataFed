configure_file(${CMAKE_CURRENT_SOURCE_DIR}/../mock/mock_start.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/../mock_start.sh 
  COPYONLY)


configure_file(${CMAKE_CURRENT_SOURCE_DIR}/../mock/mock_stop.sh 
  ${CMAKE_CURRENT_BINARY_DIR}/../mock/mock_stop.sh 
  COPYONLY)



# Each test listed in Alphabetical order
foreach(PROG
    test_gsi_authz_init
)

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(integration_${PROG} ${${PROG}_SOURCES})

  target_link_libraries(integration_${PROG} PUBLIC datafed-authz ${DATAFED_BOOST_LIBRARIES} ${DATAFED_GSSAPI_LIBRARIES} ${DATAFED_GLOBUS_COMMON_LIBRARIES})
  target_include_directories(integration_${PROG}  PRIVATE ${DataFed_SOURCE_DIR}/repository/gridftp/globus5/authz/source)
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(integration_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()


  add_test(integration_${PROG} integration_${PROG})

endforeach(PROG)
