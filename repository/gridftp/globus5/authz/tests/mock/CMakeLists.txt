

# Each test listed in Alphabetical order
foreach(PROG
    test_getVersion
)

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(mock_liveness_${PROG} ${${PROG}_SOURCES})

  target_link_libraries(mock_liveness_${PROG} PUBLIC datafed-authz ${DATAFED_BOOST_LIBRARIES} ${DATAFED_GSSAPI_LIBRARIES} ${DATAFED_GLOBUS_COMMON_LIBRARIES})
  target_include_directories(mock_liveness_${PROG}  PRIVATE ${DataFed_SOURCE_DIR}/repository/gridftp/globus5/authz/source)
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(mock_liveness_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()

  add_test(mock_liveness_${PROG} mock_liveness_${PROG})
  set_tests_properties(mock_liveness_${PROG} PROPERTIES FIXTURES_REQUIRED FIX_MOCK)

endforeach(PROG)
