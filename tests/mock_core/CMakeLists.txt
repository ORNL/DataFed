cmake_minimum_required (VERSION 3.17.0)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp"
  @ONLY)

file( GLOB Sources "*.cpp" )
file( GLOB Main "main.cpp")
list(REMOVE_ITEM Sources files ${Main})

# Must be public for unit tests to import them
if(BUILD_SHARED_LIBS)
  add_library( datafed-mock-core-lib SHARED ${Sources} )
  target_link_libraries( datafed-mock-core-lib PRIVATE protobuf::libprotobuf Threads::Threads
      ${DATAFED_BOOST_LIBRARIES} libzmq -ldl )
else()
  add_library( datafed-mock-core-lib STATIC ${Sources} )
  target_link_libraries( datafed-mock-core-lib PRIVATE protobuf::libprotobuf Threads::Threads
    "${DATAFED_BOOST_LIBRARIES}" libzmq-static
     -ldl )
endif()
target_include_directories( datafed-mock-core-lib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} )
set_target_properties(datafed-mock-core-lib PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_link_libraries( datafed-mock-core-lib PUBLIC common datafed-protobuf )
add_executable( datafed-mock-core ${Main} )
target_link_libraries( datafed-mock-core datafed-mock-core-lib )
