cmake_minimum_required (VERSION 3.0.0)

include_directories(${CMAKE_BINARY_DIR}/common)

add_subdirectory( server )
add_subdirectory( gridftp )
add_subdirectory( filesys EXCLUDE_FROM_ALL )
