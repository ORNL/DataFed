#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

# Make sure paths exist
mkdir -p ${DATAFED_INSTALL_PATH}/web
mkdir -p ${DATAFED_INSTALL_PATH}/keys
mkdir -p ${DATAFED_DEFAULT_LOG_PATH}

# Install web node modules
cp "$PROJECT_ROOT/web/package.json" ${DATAFED_INSTALL_PATH}/web/

export npm_config_cache=${DATAFED_INSTALL_PATH}/web
npm --allow-root --unsafe-perm --prefix ${DATAFED_INSTALL_PATH}/web install 
# Install javascript web server repo and core server were 
# already installed by CMake
cp "$PROJECT_ROOT/web/datafed-ws.js" ${DATAFED_INSTALL_PATH}/web

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-ws.cfg" ${DATAFED_INSTALL_PATH}/web

# Copy services
cp "$PROJECT_ROOT/services/datafed-ws.service" /etc/systemd/system

systemctl_exists=$( which systemctl )

if [[ ! -z $systemctl_exists ]]
then
  sudo systemctl daemon-reload

  echo "The ArangoDB service and core service should be up and running before you use this command"
  sudo systemctl restart datafed-ws.service
  sudo systemctl status datafed-ws.service

  # Enable services on reboot
  sudo systemctl enable datafed-ws.service
else
  echo "Not starting systemctl service because did not find systemctl."
fi
