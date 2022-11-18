message(STATUS "Running Install Web Server cmake script")
set(PROJECT_SOURCE_DIR ${CMAKE_ARGV3})

file(MAKE_DIRECTORY /opt/datafed/keys)
file(MAKE_DIRECTORY /var/log/datafed)

# Needs to occur in main CMake
file(COPY ${ProtoFiles} DESTINATION /opt/datafed/web )

file(COPY ${PROJECT_SOURCE_DIR}/web/static DESTINATION /opt/datafed/web)
file(COPY ${PROJECT_SOURCE_DIR}/web/views DESTINATION /opt/datafed/web)

if(NOT EXISTS ${PROJECT_SOURCE_DIR}/config/datafed.sh)
  execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_datafed.sh )
endif()

execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/generate_web_config.sh )

file(GLOB web-config ${PROJECT_SOURCE_DIR}/web/*.json
  ${PROJECT_SOURCE_DIR}/config/datafed-ws.cfg)
file(COPY ${web-config} DESTINATION /opt/datafed/web)

file(COPY ${PROJECT_SOURCE_DIR}/web/datafed-ws.js
  DESTINATION /opt/datafed/web
  )

# PERMISSIONS OWNER_EXECUTE OWNER_WRITE OWNER_READ
execute_process(COMMAND npm --allow-root --unsafe-perm --prefix /opt/datafed/web --cache /opt/datafed/web install)

