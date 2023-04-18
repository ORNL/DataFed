cmake_minimum_required (VERSION 3.0.0)

PROTOBUF_GENERATE_CPP( ProtoSourcesCpp ProtoHeadersCpp ${ProtoFiles} )
add_library( datafed-protobuf ${ProtoSourcesCpp} )
set_target_properties(datafed-protobuf PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION DATAFED_COMMON_PROTOCOL_API_MAJOR VERSION DATAFED_COMMON_PROTOCOL_API_MAJOR.DATAFED_COMMON_PROTOCOL_API_MINOR.DATAFED_COMMON_PROTOCOL_API_PATCH )
target_link_libraries( datafed-protobuf -lprotobuf )

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/include/common/Version.hpp.in"
  "${CMAKE_CURRENT_BINARY_DIR}/include/common/Version.hpp"
  @ONLY)
file( GLOB Sources "source/*.cpp" 
  "source/credentials/*cpp"
  "source/communicators/*.cpp"
  "source/messages/*.cpp"
  "source/operators/*.cpp"
  "source/servers/*.cpp"
  "source/support/zeromq/*.cpp"
  "source/sockets/*.cpp")
add_library( common STATIC ${Sources})
set_target_properties(common PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION DATAFED_COMMON_LIB_MAJOR VERSION DATAFED_COMMON_LIB_MAJOR.DATAFED_COMMON_LIB_MINOR.DATAFED_COMMON_LIB_PATCH )
target_link_libraries( common -lprotobuf datafed-protobuf) 
include_directories(${CMAKE_BINARY_DIR})
target_include_directories( common INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/source )

add_subdirectory(tests)
