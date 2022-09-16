#!/bin/env bash

# Not do not include "-u" in set option, we will be checking for unbound variables
# if that option is set then this script will throw an error when there is none
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

PATH_TO_SERVICE_DIR=$(realpath "$SOURCE/../services")
SERVICE_FILE_NAME="datafed-core.service"

local_DATAFED_LOG_PATH=""

if [ -z "${DATAFED_DEFAULT_LOG_PATH}" ]
then
  local_DATAFED_LOG_PATH="/var/log/datafed"
else
  local_DATAFED_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

DATAFED_CORE_LOG_FILE_PATH="/$local_DATAFED_LOG_PATH/datafed-core.log"

# Remove double forward slashes
DATAFED_CORE_LOG_FILE_PATH=$( echo "$DATAFED_CORE_LOG_FILE_PATH" | sed 's/\/\//\//g')

cat << EOF > "$PATH_TO_SERVICE_DIR/$SERVICE_FILE_NAME"
[Unit]
Description=DataFed Core Server
Requires=arangodb3.service
After=arangodb3.service
[Service]
PIDFile=/tmp/datafed-core.pid
Restart=always
KillSignal=SIGQUIT
WorkingDirectory=/opt/datafed/core
ExecStart=/opt/datafed/core/datafed-core --cfg /opt/datafed/core/datafed-core.cfg
StandardOutput=append:${DATAFED_CORE_LOG_FILE_PATH}
StandardError=append:${DATAFED_CORE_LOG_FILE_PATH}
User=cades
[Install]
WantedBy=multi-user.target
EOF
