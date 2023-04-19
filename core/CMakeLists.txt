cmake_minimum_required (VERSION 3.0.0)

add_subdirectory (database)

include_directories(${CMAKE_BINARY_DIR}/common/include)

add_subdirectory (server)

