cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" "*.c" )
add_library( datafed-authz SHARED ${Sources} )
SET_TARGET_PROPERTIES( datafed-authz PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(datafed-authz PROPERTIES POSITION_INDEPENDENT_CODE ON)
add_dependencies( datafed-authz common)
target_link_libraries( datafed-authz common -lprotobuf -lpthread -lzmq -lboost_system -lboost_filesystem -lboost_program_options)

target_include_directories( datafed-authz PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
