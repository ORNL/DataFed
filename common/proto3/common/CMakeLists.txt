cmake_minimum_required(VERSION 3.17.0)

# Generate C++ from protos
protobuf_generate(
    LANGUAGE cpp
    PROTOS ${ProtoFiles}
    IMPORT_DIRS "${CMAKE_CURRENT_SOURCE_DIR}"
    OUT_VAR protobuf-generated-files
)

add_custom_target(protobuf-gen-target DEPENDS ${protobuf-generated-files})

# Create library (respects parent's BUILD_SHARED_LIBS setting)
if(BUILD_SHARED_LIBS)
    add_library(datafed-protobuf SHARED ${protobuf-generated-files})
else()
    add_library(datafed-protobuf STATIC ${protobuf-generated-files})
endif()

add_dependencies(datafed-protobuf protobuf-gen-target)

set_target_properties(datafed-protobuf PROPERTIES
    POSITION_INDEPENDENT_CODE ON
    SOVERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR}
    VERSION ${DATAFED_COMMON_PROTOCOL_API_MAJOR}.${DATAFED_COMMON_PROTOCOL_API_MINOR}.${DATAFED_COMMON_PROTOCOL_API_PATCH}
)

target_link_libraries(datafed-protobuf
    PUBLIC protobuf::libprotobuf
)

target_include_directories(datafed-protobuf
    PUBLIC ${CMAKE_CURRENT_BINARY_DIR}  # Where generated files go
    INTERFACE ${PROJECT_BINARY_DIR}/common/proto3
)
