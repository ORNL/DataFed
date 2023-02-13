cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "source/*.cpp" )

PROTOBUF_GENERATE_CPP( ProtoSourcesCpp ProtoHeadersCpp ${ProtoFiles} )

add_library( common STATIC ${Sources} ${ProtoSourcesCpp} )
set_target_properties(common PROPERTIES POSITION_INDEPENDENT_CODE ON)
include_directories(${CMAKE_BINARY_DIR}/common)
target_include_directories( common INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/source )
