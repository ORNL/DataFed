#!/bin/bash

if [ -f ".env" ]
then
  echo ".env already exist! Will not overwrite!"
  exit 1
fi


cat << EOF > ".env"
DATAFED_DOMAIN="" # The domain of the metadata core web server
ARANGO_ROOT_PASSWORD=""
DATAFED_USER89_PASSWORD="" # For End to end testing
DATAFED_REPO_FORM_PATH="" # Where the repo form is located also needed for testing
DATAFED_GLOBUS_APP_SECRET=""
DATAFED_GLOBUS_APP_ID=""
DATAFED_ZEROMQ_SESSION_SECRET=""
DATAFED_ZEROMQ_SYSTEM_SECRET=""
DATAFED_DOMAIN=""
DATAFED_WEB_CERT_PATH=""
DATAFED_WEB_KEY_PATH=""
DATAFED_CONTAINER_LOG_PATH=""
DATAFED_DATABASE_PASSWORD=""
DATAFED_DATABASE_IP_ADDRESS_PORT="http://arango:8529"
UID="$(id -u)"
EOF
