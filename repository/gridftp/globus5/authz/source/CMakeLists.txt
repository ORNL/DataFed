cmake_minimum_required (VERSION 3.0.0)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp"
  @ONLY)
file( GLOB Sources "*.cpp" "*.c" )
add_library( datafed-authz SHARED ${Sources} )
SET_TARGET_PROPERTIES( datafed-authz PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(datafed-authz PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_AUTHZ_MAJOR} VERSION ${DATAFED_AUTHZ_MAJOR}.${DATAFED_AUTHZ_MINOR}.${DATAFED_AUTHZ_PATCH})
add_dependencies( datafed-authz common)
target_link_libraries( datafed-authz common -lprotobuf -lpthread -lzmq ${Boost_LIBRARIES})

target_include_directories( datafed-authz PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
