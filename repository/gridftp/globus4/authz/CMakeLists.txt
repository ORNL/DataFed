cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" "*.c" )
add_library( datafed-authz-binary-only SHARED ${Sources} )
SET_TARGET_PROPERTIES( datafed-authz-binary-only PROPERTIES LINKER_LANGUAGE CXX )
set_target_properties(datafed-authz-binary-only PROPERTIES POSITION_INDEPENDENT_CODE ON)
add_dependencies( datafed-authz-binary-only common)
target_link_libraries( datafed-authz-binary-only common -lprotobuf -lpthread -lzmq -lboost_system -lboost_filesystem -lboost_program_options)

target_include_directories( datafed-authz-binary-only PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

install( TARGETS datafed-authz-binary-only DESTINATION /opt/datafed/authz RENAME datafed-authz)
add_custom_target(install-authz
  COMMAND ${CMAKE_COMMAND} --build ${CMAKE_CURRENT_BINARY_DIR} --target
  datafed-authz-binary-only
  COMMAND ${CMAKE_COMMAND} -P
  ${PROJECT_SOURCE_DIR}/cmake/InstallAuthz.cmake ${PROJECT_SOURCE_DIR} 
  )
