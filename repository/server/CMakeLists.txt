cmake_minimum_required (VERSION 3.17.0)

file( GLOB Sources "*.cpp" )

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp"
  @ONLY)

add_executable( datafed-repo ${Sources} )
add_dependencies( datafed-repo common )
target_link_libraries( datafed-repo common ${Protobuf_LIBRARIES} Threads::Threads ${PkgConfig_ZMQ_LIBRARIES} ${Boost_LIBRARIES} )

target_include_directories( datafed-repo PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${PkgConfig_ZMQ_INCLUDE_DIRS} ${Protobuf_INCLUDE_DIRS})
