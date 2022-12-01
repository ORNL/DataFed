message(STATUS "Running Install Repo Server cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_ARGV4})

set(REPO_INSTALL_DIR "/opt/datafed/repo")

file(MAKE_DIRECTORY /opt/datafed/keys)
file(MAKE_DIRECTORY ${REPO_INSTALL_DIR})
file(MAKE_DIRECTORY /var/log/datafed)

# Step 1 Ensure datafed.sh file exists in /config folder with settings
if(NOT EXISTS ${PROJECT_SOURCE_DIR}/config/datafed.sh)
  execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_datafed.sh)
endif()

# Step 2 generate repo config file should place result in /config folder
execute_process(
  COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_repo_config.sh
)

# Step 3. Copy the config file over
file(COPY 
  ${PROJECT_SOURCE_DIR}/config/datafed-repo.cfg
  DESTINATION ${REPO_INSTALL_DIR}
  )

# Step 4 Install the binary
file(RENAME
  ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/datafed-repo-binary-only
  ${REPO_INSTALL_DIR}/datafed-repo
  )

# Step 5 Generate keys if missing
if(NOT EXISTS "/opt/datafed/keys/datafed-repo-key.priv")
  message(STATUS "Missing /opt/datafed/keys/datafed-repo-key(.priv/.pub) creating")
  execute_process(COMMAND ${REPO_INSTALL_DIR}/datafed-repo --gen-keys --cred-dir /opt/datafed/keys WORKING_DIRECTORY ${REPO_INSTALL_DIR})
endif()

