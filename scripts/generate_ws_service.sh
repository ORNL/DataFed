#!/bin/bash

# Not do not include "-u" in set option, we will be checking for unbound variables
# if that option is set then this script will throw an error when there is none
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

PATH_TO_SERVICE_DIR=$(realpath "$SOURCE/../services")
SERVICE_FILE_NAME="datafed-ws.service"

if [ ! -d "$PATH_TO_SERVICE_DIR" ]; then
  mkdir -p "$PATH_TO_SERVICE_DIR"
fi

local_DATAFED_LOG_PATH=""

if [ ! -z "${DATAFED_DEFAULT_LOG_PATH}" ]; then
  local_DATAFED_LOG_PATH="/var/log/datafed"
else
  local_DATAFED_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

DATAFED_WS_LOG_FILE_PATH="/$local_DATAFED_LOG_PATH/datafed-ws.log"

# Remove double forward slashes
DATAFED_WS_LOG_FILE_PATH=$(echo "$DATAFED_WS_LOG_FILE_PATH" | sed 's/\/\//\//g')
if [ -d "$PATH_TO_SERVICE_DIR" ]; then
  mkdir -p $PATH_TO_SERVICE_DIR
fi
cat <<EOF >"$PATH_TO_SERVICE_DIR/$SERVICE_FILE_NAME"
[Unit]
Description=DataFed Web Server
[Service]
PIDFile=/tmp/datafed-ws.pid
Restart=always
KillSignal=SIGQUIT
WorkingDirectory=${DATAFED_INSTALL_PATH}/web
Environment=NODE_PATH=${DATAFED_INSTALL_PATH}/web
ExecStart=${DATAFED_INSTALL_PATH}/web/datafed-ws.js ${DATAFED_INSTALL_PATH}/web/datafed-ws.cfg
StandardOutput=append:${DATAFED_WS_LOG_FILE_PATH}
StandardError=append:${DATAFED_WS_LOG_FILE_PATH}
[Install]
WantedBy=multi-user.target
EOF
