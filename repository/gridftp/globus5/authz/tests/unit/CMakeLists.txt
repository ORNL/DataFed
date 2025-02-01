# Each test listed in Alphabetical order
foreach(PROG
    test_AuthzWorker
    test_Config
    test_getVersion
    test_Util
)

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(unit_${PROG} ${${PROG}_SOURCES})

  target_link_libraries(unit_${PROG} PUBLIC datafed-authz ${DATAFED_BOOST_LIBRARIES} ${DATAFED_GSSAPI_LIBRARIES} ${DATAFED_GLOBUS_COMMON_LIBRARIES})
  target_include_directories(unit_${PROG}  PRIVATE ${DataFed_SOURCE_DIR}/repository/gridftp/globus5/authz/source)
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(unit_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()
  add_test(unit_${PROG} unit_${PROG})

endforeach(PROG)
