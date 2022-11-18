message(STATUS "Running Install Core Server cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})

file(MAKE_DIRECTORY /opt/datafed/keys)
file(MAKE_DIRECTORY /opt/datafed/core)
file(MAKE_DIRECTORY /var/log/datafed)

if(NOT EXISTS ${PROJECT_SOURCE_DIR}/config/datafed.sh)
  execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_datafed.sh)
endif()

execute_process(
  COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_core_config.sh -b
  OUTPUT_VARIABLE OUTPUT_VAR
  )

string(REPLACE "\\n" "\n" OUTPUT_VAR ${OUTPUT_VAR})
message("${OUTPUT_VAR}")

# Copy the config file over
file(GLOB core-config 
  ${PROJECT_SOURCE_DIR}/config/datafed-core.cfg)
file(COPY ${core-config} DESTINATION /opt/datafed/core/)

if(NOT EXISTS "/opt/datafed/keys/datafed-core-key.priv")
  execute_process(COMMAND "/opt/datafed/core/datafed-core" "--gen-keys"
    WORKING_DIRECTORY "/opt/datafed/core")
  file(GLOB keys /opt/datafed/core/datafed-core-key*)
  file(INSTALL ${keys} DESTINATION /opt/datafed/keys/)
endif()
