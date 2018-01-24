cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_library( fclient STATIC ${Sources} )
add_dependencies( fclient common )
target_link_libraries( fclient common -lzmq -lprotobuf -lglobus_common -lglobus_gss_assist -lglobus_gssapi_gsi -lpthread )

target_include_directories( fclient INTERFACE ${CMAKE_CURRENT_SOURCE_DIR} )
target_include_directories( fclient PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

add_subdirectory( test )
