cmake_minimum_required (VERSION 3.17.0)

# Create the .cpp and .hpp files
protobuf_generate(
  LANGUAGE cpp 
  PROTOS ${ProtoFiles}
  IMPORT_DIRS "${DataFed_SOURCE_DIR}/common/proto/common"
  OUT_VAR protobuf-generated-files
)

add_custom_target(protobuf-gen-target DEPENDS ${protobuf-generated-files})

# make sure that datafed-protobuf is dependent on the cpp files when it compiles
if(BUILD_SHARED_LIBS)
  add_library( datafed-protobuf SHARED ${protobuf-generated-files}  )
else()
  add_library( datafed-protobuf STATIC ${protobuf-generated-files} )
endif()
# The following command makes sure that the protobuf files are generated
# before attempting to compile with them.
add_dependencies(datafed-protobuf protobuf-gen-target)
set_target_properties(datafed-protobuf PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR} VERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR}.${DATAFED_COMMON_PROTOCOL_API_MINOR}.${DATAFED_COMMON_PROTOCOL_API_PATCH} )
target_link_libraries( datafed-protobuf protobuf::libprotobuf protobuf::libprotoc protobuf::libprotobuf-lite)
target_include_directories( datafed-protobuf INTERFACE ${PROJECT_BINARY_DIR}/common/proto)
