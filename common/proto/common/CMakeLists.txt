cmake_minimum_required (VERSION 3.17.0)

# The below command will by default generate the proto files in this folder
# we want to place them in the binary folder in /proto/common
#PROTOBUF_GENERATE_CPP( ProtoSourcesCpp ProtoHeadersCpp ${ProtoFiles} )
#protobuf_generate_cpp( ProtoSourcesCpp ProtoHeadersCpp ${ProtoFiles} )
#add_library( proto-files-cpp OBJECT ${ProtoFiles} )
#set(TARGET_NAME "ProtoFiles")
#protobuf_generate(
#   LANGUAGE cpp
#   TARGET ${proto-files-cpp}
#)

#   set( ${TARGET_NAME}_generated_h.h
#  ${TARGET_NAME}_generated_cpp.cc
#     )
message("ProtoFiles ${ProtoFiles}")
add_library( protobuf-target ${ProtoFiles} )

# Create the .cpp and .hpp files
protobuf_generate(
  TARGET protobuf-target
  LANGUAGE cpp 
  IMPORT_DIRS "${DataFed_SOURCE_DIR}/common/proto/common"
  OUT_VAR protobuf-generated-files
)

# make sure that datafed-protobuf is dependent on the cpp files when it compiles
message("Protobuf generated files ${protobuf-generated-files}")
add_library( datafed-protobuf STATIC ${protobuf-generated-files} )
set_target_properties(datafed-protobuf PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR} VERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR}.${DATAFED_COMMON_PROTOCOL_API_MINOR}.${DATAFED_COMMON_PROTOCOL_API_PATCH} )
target_link_libraries( datafed-protobuf protobuf::libprotobuf protobuf::libprotoc protobuf::libprotobuf-lite)
target_include_directories( datafed-protobuf INTERFACE ${PROJECT_BINARY_DIR}/common/proto)



     #add_library( datafed-protobuf ${ProtoSourcesCpp} )
     #set_target_properties(datafed-protobuf PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR} VERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR}.${DATAFED_COMMON_PROTOCOL_API_MINOR}.${DATAFED_COMMON_PROTOCOL_API_PATCH} )
     #target_link_libraries( datafed-protobuf -lprotobuf )
     #target_include_directories( datafed-protobuf INTERFACE ${PROJECT_BINARY_DIR}/common/proto)
