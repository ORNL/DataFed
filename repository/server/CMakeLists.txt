cmake_minimum_required (VERSION 3.17.0)

file( GLOB Sources "*.cpp" )

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp"
  @ONLY)

add_executable( datafed-repo ${Sources} )
add_dependencies( datafed-repo common )
if(BUILD_SHARED_LIBS)
  target_link_libraries( datafed-repo common Threads::Threads libzmq datafed-protobuf ${DATAFED_BOOST_LIBRARIES} )
else()
  target_link_libraries( datafed-repo common Threads::Threads libzmq-static datafed-protobuf ${DATAFED_BOOST_LIBRARIES} )
endif()
 

target_include_directories( datafed-repo PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
