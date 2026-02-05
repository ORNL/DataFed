cmake_minimum_required (VERSION 3.17.0)

# Copy py source to build package source dir
file( GLOB SrcFiles ${CMAKE_CURRENT_SOURCE_DIR}/*.py )
foreach(file ${SrcFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )
endforeach()

# Collect proto files from the new 1-1-1 directory structure
file( GLOB_RECURSE ProtoFiles ${DataFed_SOURCE_DIR}/common/proto3/common/*.proto )

# OBJECT - is needed because we don't want to compile to a binary
# because we are dealing with python
add_library(protobuf-target-py OBJECT ${ProtoFiles})

protobuf_generate(
    LANGUAGE python
    TARGET protobuf-target-py
    IMPORT_DIRS "${DataFed_SOURCE_DIR}/common/proto3/common"
    OUT_VAR protobuf-generated-files-py
    PROTOC_OUT_DIR "${CMAKE_CURRENT_BINARY_DIR}"
  )

add_custom_target( pydatafed_src DEPENDS protobuf-target-py )

# Fix relative imports in generated pb2 files
# No longer need pyproto_add_msg_idx.py — message type IDs are derived
# at runtime from envelope field numbers via registerEnvelope()
add_custom_command( TARGET pydatafed_src POST_BUILD
    COMMAND sed -i -r 's:^import.*_pb2:from . \\0:' ${protobuf-generated-files-py}
)

# Create copies of the files so they show up in the source folder as well
# for the purpose of testing
add_custom_target( pydatafed_proto_src DEPENDS pydatafed_src )
add_custom_command( TARGET pydatafed_proto_src POST_BUILD pydatafed_src
  COMMAND cp ${CMAKE_CURRENT_BINARY_DIR}/envelope_pb2.py ${CMAKE_CURRENT_SOURCE_DIR}/
)
