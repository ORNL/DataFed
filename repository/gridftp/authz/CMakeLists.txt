cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" "*.c" )
add_library( DataFedAuthz SHARED ${Sources} )
SET_TARGET_PROPERTIES( DataFedAuthz PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(DataFedAuthz PROPERTIES POSITION_INDEPENDENT_CODE ON)
add_dependencies( DataFedAuthz common)
target_link_libraries( DataFedAuthz common -lprotobuf -lpthread -lzmq -lboost_system -lboost_filesystem -lboost_program_options)

target_include_directories( DataFedAuthz PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
