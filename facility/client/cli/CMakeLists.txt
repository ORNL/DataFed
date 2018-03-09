cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( sdms ${Sources} )
add_dependencies( sdms fclient )

target_link_libraries( sdms fclient -lboost_program_options -lreadline )

target_include_directories( sdms PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
