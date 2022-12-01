cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( datafed-core-binary-only ${Sources} )
add_dependencies( datafed-core-binary-only common )
target_link_libraries( datafed-core-binary-only OpenSSL::Crypto common -lprotobuf -lpthread -lcurl -lboost_program_options -lzmq -lnlohmann_json_schema_validator )

target_include_directories(datafed-core-binary-only PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

install( TARGETS datafed-core-binary-only DESTINATION /opt/datafed/core RENAME datafed-core)
add_custom_target(install-core-server
  COMMAND ${CMAKE_COMMAND} --build ${CMAKE_CURRENT_BINARY_DIR} --target
  datafed-core-binary-only
  COMMAND ${CMAKE_COMMAND} -P
  ${PROJECT_SOURCE_DIR}/cmake/InstallCoreServer.cmake ${PROJECT_SOURCE_DIR} ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}
  )
add_custom_Target(install-core-service
  COMMAND ${CMAKE_COMMAND} -P ${PROJECT_SOURCE_DIR}/cmake/InstallCoreService.cmake
  DEPENDS install-core-server
  )

