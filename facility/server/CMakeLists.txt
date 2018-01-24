cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( sdmsfd ${Sources} )
add_dependencies( sdmsfd common )
target_link_libraries( sdmsfd common -lzmq -lprotobuf -lglobus_common -lglobus_gss_assist -lglobus_gssapi_gsi pthread )

target_include_directories( sdmsfd PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
