file(MAKE_DIRECTORY /opt/datafed/keys)
file(MAKE_DIRECTORY /var/log/datafed)

# Copy the config file over
file(GLOB 
  ${PROJECT_SOURCE_DIR}/config/datafed-repo.cfg)

if(NOT EXISTS "/opt/datafed/keys/datafed-repo-key.priv")
  execute_process(COMMAND "/opt/datafed/repo/datafed-repo" "--gen-keys
  --cred-dir /opt/datafed/keys"
    WORKING_DIRECTORY "/opt/datafed/repo")
  install(FILES /opt/datafed/core/datafed-core-key* /opt/datafed/keys/)
endif()

install( TARGETS datafed-repo DESTINATION /opt/datafed/repo )
