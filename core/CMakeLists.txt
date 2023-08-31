cmake_minimum_required (VERSION 3.17.0)

if( BUILD_FOXX )
  add_subdirectory (database)
endif()

if( BUILD_CORE_SERVER ) 
  include_directories(${CMAKE_BINARY_DIR}/common/include)
  add_subdirectory (server)
endif()

