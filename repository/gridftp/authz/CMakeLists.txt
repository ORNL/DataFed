cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" "*.c" )
add_library( sdmsauthz SHARED ${Sources} )
SET_TARGET_PROPERTIES( sdmsauthz PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(sdmsauthz PROPERTIES POSITION_INDEPENDENT_CODE ON)
add_dependencies( sdmsauthz common)
target_link_libraries( sdmsauthz -lcurl common -lprotobuf -lpthread -lzmq -lboost_system -lboost_filesystem -lboost_program_options)

target_include_directories( sdmsauthz PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
