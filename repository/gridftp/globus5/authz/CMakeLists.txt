cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" "*.c" )
add_library( datafed-authz-library-only SHARED ${Sources} )
SET_TARGET_PROPERTIES( datafed-authz-library-only PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(datafed-authz-library-only PROPERTIES POSITION_INDEPENDENT_CODE ON)
add_dependencies( datafed-authz-library-only common)
target_link_libraries( datafed-authz-library-only common -lprotobuf -lpthread -lzmq -lboost_system -lboost_filesystem -lboost_program_options)

target_include_directories( datafed-authz-library-only PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

add_custom_target(install-authz
  COMMAND ${CMAKE_COMMAND} --build ${CMAKE_CURRENT_BINARY_DIR} --target
  datafed-authz-library-only
  COMMAND ${CMAKE_COMMAND} -P
  ${PROJECT_SOURCE_DIR}/cmake/InstallAuthzLibrary.cmake  ${PROJECT_SOURCE_DIR}
  ${CMAKE_LIBRARY_OUTPUT_DIRECTORY}
  )
