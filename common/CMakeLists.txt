cmake_minimum_required (VERSION 3.0.0)

file( GLOB ProtoFiles "${CMAKE_CURRENT_SOURCE_DIR}/proto/*.proto" )
file( GLOB Sources "source/*.cpp" )

PROTOBUF_GENERATE_CPP( ProtoSourcesCpp ProtoHeadersCpp ${ProtoFiles} )

add_library( common STATIC ${Sources} ${ProtoSourcesCpp} )
set_target_properties(common PROPERTIES POSITION_INDEPENDENT_CODE ON)
include_directories(${CMAKE_BINARY_DIR}/common)
target_include_directories( common INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include )
target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/source )

# Copy proto files to web server source dir
# TODO Should be to a deployment/install dir, not source
foreach(file ${ProtoFiles})
    configure_file(${file} ${CMAKE_SOURCE_DIR}/web/ COPYONLY )
    #configure_file(${file} ${CMAKE_SOURCE_DIR}/python/ COPYONLY )
endforeach()

