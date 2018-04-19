cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( sdms-core ${Sources} )
add_dependencies( sdms-core common )
target_link_libraries( sdms-core common -lprotobuf -lpthread -lcrypto -lssl -lcurl -lboost_program_options )

target_include_directories( sdms-core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
