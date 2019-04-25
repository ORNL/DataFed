cmake_minimum_required (VERSION 3.0.0)

# Copy py source to python "binary" dir
file( GLOB SrcFiles ${CMAKE_SOURCE_DIR}/python/*.py )
foreach(file ${SrcFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )
endforeach()

# Generate py proto files
file( GLOB ProtoFiles ${CMAKE_SOURCE_DIR}/common/proto/*.proto )
PROTOBUF_GENERATE_PYTHON( ProtoFilesPy ${ProtoFiles} )
add_custom_target( pydatafed ALL DEPENDS ${ProtoFilesPy} )