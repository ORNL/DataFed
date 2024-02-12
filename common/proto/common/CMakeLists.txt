cmake_minimum_required (VERSION 3.17.0)

add_library( protobuf-target ${ProtoFiles} )

# Create the .cpp and .hpp files
protobuf_generate(
  TARGET protobuf-target
  LANGUAGE cpp 
  IMPORT_DIRS "${DataFed_SOURCE_DIR}/common/proto/common"
  OUT_VAR protobuf-generated-files
)

# make sure that datafed-protobuf is dependent on the cpp files when it compiles
add_library( datafed-protobuf ${protobuf-generated-files} )
set_target_properties(datafed-protobuf PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR} VERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR}.${DATAFED_COMMON_PROTOCOL_API_MINOR}.${DATAFED_COMMON_PROTOCOL_API_PATCH} )
target_link_libraries( datafed-protobuf ${Protobuf_LIBRARIES} )
target_include_directories( datafed-protobuf INTERFACE ${PROJECT_BINARY_DIR}/common/proto)
