message(STATUS "Running Install Web Service cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})

execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_ws_service.sh )
