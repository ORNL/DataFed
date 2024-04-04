# Each test listed in Alphabetical order

  include_directories(${PROJECT_SOURCE_DIR}/repository/gridftp/globus5/authz/source)
  add_executable(unit_test_URL test_URL.cpp ../../source/URL.c )

  target_compile_options(unit_test_URL PRIVATE -fPIC)

  add_dependencies(unit_test_URL common)
  if(BUILD_SHARED_LIBS)
    target_link_libraries(unit_test_URL PRIVATE ${DATAFED_BOOST_LIBRARIES}) 
    target_compile_definitions(unit_test_URL PRIVATE BOOST_TEST_DYN_LINK)
  else()
    target_link_libraries(unit_test_URL PRIVATE ${DATAFED_BOOST_LIBRARIES}) 
  endif()
  # Only want this if using shared boost libraries
  add_test(unit_test_URL unit_test_URL)
   
