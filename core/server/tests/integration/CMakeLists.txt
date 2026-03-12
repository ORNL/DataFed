# Each test listed in Alphabetical order
foreach(PROG
    test_SchemaServiceFactory
)

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(integration_${PROG} ${${PROG}_SOURCES})
  target_link_libraries(integration_${PROG} PUBLIC datafed-core-lib ${DATAFED_BOOST_LIBRARIES})
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(integration_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()
  if ( ENABLE_UNIT_TESTS )
    add_test(integration_${PROG} integration_${PROG})
  endif( ENABLE_UNIT_TESTS )
  if ( ENABLE_MEMORY_TESTS )
    add_test(NAME memory_${PROG} COMMAND valgrind  --leak-check=full --error-exitcode=1 $<TARGET_FILE:integration_${PROG}>)
  endif( ENABLE_MEMORY_TESTS )

endforeach(PROG)
