message(STATUS "Running Install Repo Service cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})

execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_repo_service.sh )
execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_repo_service.sh )
