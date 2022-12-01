message(STATUS "Running Install Core Server cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_ARGV4})

set(CORE_INSTALL_DIR "/opt/datafed/core")

file(MAKE_DIRECTORY /opt/datafed/keys)
file(MAKE_DIRECTORY ${CORE_INSTALL_DIR})
file(MAKE_DIRECTORY /var/log/datafed)

# Step 1 Ensure datafed.sh file exists in /config folder with settings
if(NOT EXISTS ${PROJECT_SOURCE_DIR}/config/datafed.sh)
  execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_datafed.sh)
endif()

# Step 2 generate core config file should place result in /config folder
execute_process(
  COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_core_config.sh --ignore-checks
  OUTPUT_VARIABLE OUTPUT_VAR
  )

string(REPLACE "\\n" "\n" OUTPUT_VAR ${OUTPUT_VAR})
message("${OUTPUT_VAR}")

# Step 3. Copy the config file over
file(GLOB core-config 
  ${PROJECT_SOURCE_DIR}/config/datafed-core.cfg)
file(COPY ${core-config} DESTINATION ${CORE_INSTALL_DIR})

# Step 4 Install the binary
file(RENAME
  ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/datafed-core-binary-only
  ${CORE_INSTALL_DIR}/datafed-core
  )

# Step 5 Generate keys if missing
if(NOT EXISTS "/opt/datafed/keys/datafed-core-key.priv")
  message(STATUS "Missing /opt/datafed/keys/datafed-core-key(.priv/.pub) creating")
  execute_process(COMMAND "${CORE_INSTALL_DIR}/datafed-core" "--gen-keys"
    WORKING_DIRECTORY /opt/datafed/keys)
endif()
