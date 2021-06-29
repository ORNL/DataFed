cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( datafed-core ${Sources} )
add_dependencies( datafed-core common )
target_link_libraries( datafed-core common -lprotobuf -lpthread -lcrypto -lssl -lcurl -lboost_program_options -lzmq -lnlohmann_json_schema_validator )

target_include_directories( datafed-core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
