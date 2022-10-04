
foreach(PROG
    test_curl_client
)

  file(GLOB ${PROG}_SOURCES ${PROG}*.cpp)
  add_executable(unit_${PROG} ${${PROG}_SOURCES})
  target_link_libraries(unit_${PROG} ${Boost_LIBRARIES} datafed-core-refactor)
  add_test(unit_${PROG} unit_${PROG})
  set_tests_properties(unit_${PROG} PROPERTIES LABELS "core;unit")
  
endforeach(PROG)
