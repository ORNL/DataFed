# Each test listed in Alphabetical order
foreach(PROG
    test_AuthMap
    test_AuthenticationManager
    test_TaskWorker
    )

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(unit_${PROG} ${${PROG}_SOURCES})
  target_link_libraries(unit_${PROG} PUBLIC datafed-core-lib ${DATAFED_BOOST_LIBRARIES})
  if(BUILD_SHARED_LIBS)
    target_compile_definitions(unit_${PROG} PRIVATE BOOST_TEST_DYN_LINK)
  endif()
  add_test(unit_${PROG} unit_${PROG})

endforeach(PROG)
