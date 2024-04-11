cmake_minimum_required (VERSION 3.17.0)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp"
  @ONLY)

file( GLOB AUTHZ_Sources "URL.c" )
file( GLOB Sources "*.cpp" "*.c" )
add_library( datafed-authz SHARED ${Sources} )

target_compile_options(datafed-authz PRIVATE -fPIC)
SET_TARGET_PROPERTIES( datafed-authz PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(datafed-authz PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_AUTHZ_MAJOR} VERSION ${DATAFED_AUTHZ_MAJOR}.${DATAFED_AUTHZ_MINOR}.${DATAFED_AUTHZ_PATCH})
add_dependencies( datafed-authz common)


if(BUILD_SHARED_LIBS)
  target_link_libraries( datafed-authz common Threads::Threads libzmq
    datafed-protobuf ${DATAFED_BOOST_LIBRARIES} )
else()
  target_link_libraries( datafed-authz common Threads::Threads libzmq-static
    datafed-protobuf ${DATAFED_BOOST_LIBRARIES} )
endif()
target_include_directories( datafed-authz PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
