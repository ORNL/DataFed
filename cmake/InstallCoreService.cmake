message(STATUS "Running Install Core Service cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})

execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_core_service.sh )
execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_core_service.sh )
