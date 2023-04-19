cmake_minimum_required (VERSION 3.0.0)

# The below command will by default generate the proto files in this folder
# we want to place them in the binary folder in /proto/common
PROTOBUF_GENERATE_CPP( ProtoSourcesCpp ProtoHeadersCpp ${ProtoFiles} )
add_library( datafed-protobuf ${ProtoSourcesCpp} )
set_target_properties(datafed-protobuf PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR} VERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR}.${DATAFED_COMMON_PROTOCOL_API_MINOR}.${DATAFED_COMMON_PROTOCOL_API_PATCH} )
target_link_libraries( datafed-protobuf -lprotobuf )
target_include_directories( datafed-protobuf INTERFACE ${PROJECT_BINARY_DIR}/common/proto)
