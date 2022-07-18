cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" "*.c" )
add_library( datafedauthz SHARED ${Sources} )
SET_TARGET_PROPERTIES( datafedauthz PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(datafedauthz PROPERTIES POSITION_INDEPENDENT_CODE ON)
add_dependencies( datafedauthz common)
target_link_libraries( datafedauthz common -lprotobuf -lpthread -lzmq -lboost_system -lboost_filesystem -lboost_program_options)

target_include_directories( datafedauthz PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
