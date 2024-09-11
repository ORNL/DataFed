cmake_minimum_required (VERSION 3.17.0)

# Copy py source to build package source dir
file( GLOB SrcFiles ${CMAKE_CURRENT_SOURCE_DIR}/*.py )
foreach(file ${SrcFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )
endforeach()

# Collect top-level proto files as dependencies
file( GLOB ProtoFiles ${DataFed_SOURCE_DIR}/common/proto/common/*.proto )

# OBJECT - is needed because we don't want to compile to a binary
# because we are dealing with python
add_library(protobuf-target-py OBJECT ${ProtoFiles})
protobuf_generate(
    LANGUAGE python
    TARGET protobuf-target-py
    IMPORT_DIRS "${DataFed_SOURCE_DIR}/common/proto/common"
    OUT_VAR protobuf-generated-files-py
    PROTOC_OUT_DIR "${CMAKE_CURRENT_BINARY_DIR}"
  )

add_custom_target( pydatafed_src DEPENDS protobuf-target-py )

# By default this will output the proto py files in the CMAKE BINARY DIR
add_custom_command( TARGET pydatafed_src POST_BUILD
    COMMAND sed -i -r 's:^import.*_pb2:from . \\0:' ${protobuf-generated-files-py}
    COMMAND ${DataFed_SOURCE_DIR}/python/pyproto_add_msg_idx.py ${DataFed_SOURCE_DIR}/common/proto/common/SDMS_Anon.proto ${CMAKE_CURRENT_BINARY_DIR}/SDMS_Anon_pb2.py
    COMMAND ${DataFed_SOURCE_DIR}/python/pyproto_add_msg_idx.py ${DataFed_SOURCE_DIR}/common/proto/common/SDMS_Auth.proto ${CMAKE_CURRENT_BINARY_DIR}/SDMS_Auth_pb2.py 
)     
      
# Crea#te copies of the files so they show up in the source folder as well 
# for the purpose of testing
add_custom_target( pydatafed_proto_src DEPENDS pydatafed_src )
add_custom_command( TARGET pydatafed_proto_src POST_BUILD pydatafed_src 
  COMMAND cp ${CMAKE_CURRENT_BINARY_DIR}/SDMS_Auth_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/ 
  COMMAND cp ${CMAKE_CURRENT_BINARY_DIR}/SDMS_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/ 
  COMMAND cp ${CMAKE_CURRENT_BINARY_DIR}/Version_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/ 
  COMMAND cp ${CMAKE_CURRENT_BINARY_DIR}/SDMS_Anon_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/
)


