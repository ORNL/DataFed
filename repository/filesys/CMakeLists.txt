cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( datafed-fs ${Sources} )
add_dependencies( datafed-fs common )
target_link_libraries( datafed-fs common -lprotobuf -lpthread -lzmq -lfuse -lboost_system -lboost_program_options )

target_include_directories( datafed-fs PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
