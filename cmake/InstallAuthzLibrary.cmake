message(STATUS "Running Install Authz Server cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_ARGV4})

set(AUTHZ_INSTALL_DIR "/opt/datafed/authz")

file(MAKE_DIRECTORY ${AUTHZ_INSTALL_DIR})
file(MAKE_DIRECTORY /var/log/datafed)

# Step 1 Ensure datafed.sh file exists in /config folder with settings
if(NOT EXISTS ${PROJECT_SOURCE_DIR}/config/datafed.sh)
  execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_datafed.sh)
endif()

# Step 2 generate authz config file should place result in /config folder
execute_process(
  COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_authz_config.sh
)

# Step 3. Copy the config file over
file(COPY 
  ${PROJECT_SOURCE_DIR}/config/datafed-authz.cfg
  DESTINATION ${AUTHZ_INSTALL_DIR}
  )


# Step 4 Install the binary
file(RENAME
  ${CMAKE_LIBRARY_OUTPUT_DIRECTORY}/libdatafed-authz-library-only.so
  ${AUTHZ_INSTALL_DIR}/libdatafed-authz.so
  )

# Step 5 Copy over the grid security file
file(COPY 
  ${PROJECT_SOURCE_DIR}/config/gsi-authz.conf
  DESTINATION /etc/grid-security
  )



