cmake_minimum_required (VERSION 3.0.0)

# Copy py source to build package source dir
file( GLOB SrcFiles ${CMAKE_CURRENT_SOURCE_DIR}/*.py )
foreach(file ${SrcFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )
endforeach()

# Collect top-level proto files as dependencies
file( GLOB ProtoFiles ${CMAKE_SOURCE_DIR}/common/proto/common/*.proto )

# Create proto target and rules to generate py proto files
PROTOBUF_GENERATE_PYTHON( ProtoFilesPy ${ProtoFiles} )

add_custom_target( pydatafed_src DEPENDS ${ProtoFilesPy} )

add_custom_command( TARGET pydatafed_src POST_BUILD
    COMMAND sed -i -r 's:^import.*_pb2:from . \\0:' ${ProtoFilesPy}
    COMMAND ${CMAKE_SOURCE_DIR}/python/pyproto_add_msg_idx.py
    ${CMAKE_SOURCE_DIR}/common/proto/common/SDMS_Anon.proto SDMS_Anon_pb2.py
    COMMAND ${CMAKE_SOURCE_DIR}/python/pyproto_add_msg_idx.py
    ${CMAKE_SOURCE_DIR}/common/proto/common/SDMS_Auth.proto SDMS_Auth_pb2.py )

# Create copies of the files so they show up in the source folder as well 
# for the purpose of testing
add_custom_target( pydatafed_proto_src DEPENDS pydatafed_src )
add_custom_command( TARGET pydatafed_proto_src POST_BUILD pydatafed_src 
    COMMAND cp SDMS_Auth_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/ 
    COMMAND cp SDMS_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/ 
    COMMAND cp Version_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/ 
    COMMAND cp SDMS_Anon_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/ )
