add_subdirectory( source )

if( BUILD_AUTHZ_TESTS )
  add_subdirectory( mock_core )
  add_subdirectory( tests )
endif()
