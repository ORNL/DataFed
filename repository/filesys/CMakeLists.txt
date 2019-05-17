cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( sdms-fs ${Sources} )
add_dependencies( sdms-fs common )
target_link_libraries( sdms-fs common -lprotobuf -lpthread -lzmq -lfuse -lboost_system -lboost_program_options )

target_include_directories( sdms-fs PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
