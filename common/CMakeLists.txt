cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "source/*.cpp" 
  "source/credentials/*cpp"
  "source/communicators/*.cpp"
  "source/messages/*.cpp"
  "source/operators/*.cpp"
  "source/servers/*.cpp"
  "source/support/zeromq/*.cpp"
  "source/sockets/*.cpp")

PROTOBUF_GENERATE_CPP( ProtoSourcesCpp ProtoHeadersCpp ${ProtoFiles} )

add_library( common STATIC ${Sources} ${ProtoSourcesCpp} )
set_target_properties(common PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_link_libraries( common -lprotobuf ) 
include_directories(${CMAKE_BINARY_DIR}/common)
target_include_directories( common INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/source )

add_subdirectory(tests)
