
if(GLOBUS_VERSION EQUAL 5)
  message("-- Building Globus 5")
  add_subdirectory( globus5 )
else()
  message("-- Building Globus 4")
  add_subdirectory( globus4 )
endif()
