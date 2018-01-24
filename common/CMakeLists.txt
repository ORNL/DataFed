cmake_minimum_required (VERSION 3.0.0)

file( GLOB ProtoFiles "${CMAKE_CURRENT_SOURCE_DIR}/proto/*.proto" )
PROTOBUF_GENERATE_CPP( ProtoSources ProtoHeaders ${ProtoFiles} )

file( GLOB Sources "source/*.cpp" )

add_library( common STATIC ${Sources} ${ProtoSources} )

include_directories(${CMAKE_BINARY_DIR}/common)
target_include_directories( common INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/source )
