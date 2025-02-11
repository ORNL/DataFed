cmake_minimum_required (VERSION 3.17.0)

include_directories(${CMAKE_BINARY_DIR}/common)

if( BUILD_REPO_SERVER )
  add_subdirectory( server )
endif()

if( BUILD_AUTHZ )
  add_subdirectory( gridftp )
endif()
