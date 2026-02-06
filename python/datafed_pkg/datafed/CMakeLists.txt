cmake_minimum_required(VERSION 3.17.0)

# Copy py source to build package source dir
file(GLOB SrcFiles ${CMAKE_CURRENT_SOURCE_DIR}/*.py)
foreach(file ${SrcFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY)
endforeach()

# Collect proto files from the new 1-1-1 directory structure
file(GLOB_RECURSE ProtoFiles ${DataFed_SOURCE_DIR}/common/proto3/common/*.proto)

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

add_custom_target(pydatafed_src DEPENDS protobuf-target-py)

# Proto subdirectories that protoc generates imports for
set(PROTO_SUBDIRS anon auth enums messages)

# Fix imports in generated pb2 files to use relative imports within the package.
# protoc generates absolute imports like:
#   from anon import ack_reply_pb2 as ...
#   from enums import error_code_pb2 as ...
#   import envelope_pb2 as ...
# These must become relative imports:
#   from .anon import ack_reply_pb2 as ...
#   from .enums import error_code_pb2 as ...
#   from . import envelope_pb2 as ...
add_custom_command(TARGET pydatafed_src POST_BUILD
    COMMAND find ${CMAKE_CURRENT_BINARY_DIR} -name "*_pb2.py" -exec
        sed -i -r
        -e "s:^from (anon|auth|enums|messages) import:from .\\1 import:g"
        -e "s:^from (anon|auth|enums|messages)\\.:from .\\1.:g"
        -e "s:^import ([a-zA-Z0-9_]*_pb2):from . import \\1:g"
        {} +
    COMMENT "Rewriting protobuf imports to relative"
)

# Ensure __init__.py exists in each generated subdirectory
foreach(subdir ${PROTO_SUBDIRS})
    add_custom_command(TARGET pydatafed_src POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_CURRENT_BINARY_DIR}/${subdir}
        COMMAND ${CMAKE_COMMAND} -E touch ${CMAKE_CURRENT_BINARY_DIR}/${subdir}/__init__.py
    )
endforeach()

# Copy generated files back to source tree for testing
add_custom_target(pydatafed_proto_src DEPENDS pydatafed_src)
add_custom_command(TARGET pydatafed_proto_src POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
        ${CMAKE_CURRENT_BINARY_DIR}/envelope_pb2.py
        ${CMAKE_CURRENT_SOURCE_DIR}/
    # Copy subdirectories back to source for testing
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_CURRENT_BINARY_DIR}/anon ${CMAKE_CURRENT_SOURCE_DIR}/anon
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_CURRENT_BINARY_DIR}/auth ${CMAKE_CURRENT_SOURCE_DIR}/auth
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_CURRENT_BINARY_DIR}/enums ${CMAKE_CURRENT_SOURCE_DIR}/enums
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_CURRENT_BINARY_DIR}/messages ${CMAKE_CURRENT_SOURCE_DIR}/messages
)
