cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( datafed-repo-binary-only ${Sources} )
add_dependencies( datafed-repo-binary-only common )
target_link_libraries( datafed-repo-binary-only common -lprotobuf -lpthread -lzmq -lboost_system -lboost_filesystem -lboost_program_options )

target_include_directories( datafed-repo-binary-only PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

# Repo
install( TARGETS datafed-repo-binary-only DESTINATION /opt/datafed/repo )

add_custom_Target(install-repo-server
  COMMAND ${CMAKE_COMMAND} --build ${CMAKE_CURRENT_BINARY_DIR} --target
  datafed-repo-binary-only
  COMMAND ${CMAKE_COMMAND} -P ${PROJECT_SOURCE_DIR}/cmake/InstallRepoServer.cmake
  )
add_custom_Target(install-repo-service
  COMMAND ${CMAKE_COMMAND} -P ${PROJECT_SOURCE_DIR}/cmake/InstallRepoService.cmake
  )


