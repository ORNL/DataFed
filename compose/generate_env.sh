#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

if [ -f ".env" ]
then
  echo ".env already exist! Will not overwrite!"
  exit 1
fi

local_DATAFED_WEB_KEY_DIR="${PROJECT_ROOT}/compose/web_keys"
if [ ! -d "$local_DATAFED_WEB_KEY_DIR" ]
then
  mkdir -p "$local_DATAFED_WEB_KEY_DIR"
fi

local_DATAFED_WEB_CERT_PATH="${local_DATAFED_WEB_KEY_DIR}/cert.crt"
local_DATAFED_WEB_CSR_PATH="${local_DATAFED_WEB_KEY_DIR}/cert.csr"
local_DATAFED_WEB_KEY_PATH="${local_DATAFED_WEB_KEY_DIR}/cert.key"
if [ ! -e "$local_DATAFED_WEB_CERT_PATH" ] || [ ! -e "$local_DATAFED_WEB_KEY_PATH" ]
then
  rm "${local_DATAFED_WEB_CERT_PATH}"
  rm "${local_DATAFED_WEB_KEY_PATH}"
  rm "${local_DATAFED_WEB_CSR_PATH}"

  openssl genrsa -out "$local_DATAFED_WEB_KEY_PATH" 2048
  openssl req -new -key "$local_DATAFED_WEB_KEY_PATH" \
    -out "${local_DATAFED_WEB_CSR_PATH}"
  openssl x509 -req -days 3650 \
     -in "${local_DATAFED_WEB_CSR_PATH}" \
     -signkey "$local_DATAFED_WEB_KEY_PATH" \
     -out "$local_DATAFED_WEB_CERT_PATH"
fi

cat << EOF > ".env"
DATAFED_DOMAIN="localhost" # The domain of the metadata web server
DATAFED_USER89_PASSWORD="" # For End to end testing
DATAFED_REPO_FORM_PATH="" # Where the repo form is located also needed for testing
DATAFED_GLOBUS_APP_SECRET=""
DATAFED_GLOBUS_APP_ID=""
DATAFED_ZEROMQ_SESSION_SECRET=""
DATAFED_ZEROMQ_SYSTEM_SECRET=""
DATAFED_DOMAIN=""
DATAFED_HTTPS_SERVER_PORT="443"
DATAFED_WEB_CERT_PATH="${local_DATAFED_WEB_CERT_PATH}"
DATAFED_WEB_KEY_PATH="${local_DATAFED_WEB_KEY_PATH}"
DATAFED_CONTAINER_LOG_PATH="/opt/datafed/logs"
DATAFED_DATABASE_PASSWORD=""
DATAFED_DATABASE_IP_ADDRESS_PORT="http://arango:8529"
UID="$(id -u)"
EOF
