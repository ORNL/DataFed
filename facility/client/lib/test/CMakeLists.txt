cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( fctest ${Sources} )
add_dependencies( fctest fclient )

target_link_libraries( fctest fclient )

target_include_directories( fctest PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
