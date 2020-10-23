cmake_minimum_required (VERSION 3.0.0)

# Copy py source to build package source dir
file( GLOB SrcFiles ${CMAKE_CURRENT_SOURCE_DIR}/*.py )
foreach(file ${SrcFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )
endforeach()

# Generate py proto files
file( GLOB ProtoFiles ${CMAKE_SOURCE_DIR}/common/proto/*.proto )
PROTOBUF_GENERATE_PYTHON( ProtoFilesPy ${ProtoFiles} )

add_custom_target( pydatafed ALL DEPENDS ${ProtoFilesPy})

add_custom_command( TARGET pydatafed POST_BUILD
    COMMAND sed -i -r 's:^import.*_pb2:from . \\0:' ${ProtoFilesPy} )

add_custom_command( TARGET pydatafed POST_BUILD
    COMMAND ${CMAKE_SOURCE_DIR}/python/pyproto_add_msg_idx.py ${CMAKE_SOURCE_DIR}/common/proto/SDMS_Anon.proto SDMS_Anon_pb2.py
    COMMAND ${CMAKE_SOURCE_DIR}/python/pyproto_add_msg_idx.py ${CMAKE_SOURCE_DIR}/common/proto/SDMS_Auth.proto SDMS_Auth_pb2.py )