#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

# Make sure paths exist
mkdir -p ${DATAFED_INSTALL_PATH}/core
mkdir -p ${DATAFED_INSTALL_PATH}/keys
mkdir -p ${DATAFED_DEFAULT_LOG_PATH}

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-core.cfg" ${DATAFED_INSTALL_PATH}/core


# Move keys to /opt/datafed/keys if they do not already exist
if [ ! -f ${DATAFED_INSTALL_PATH}/keys/datafed-core-key.priv ]
then
  # Generate keys
  ${DATAFED_INSTALL_PATH}/core/datafed-core --gen-keys
  mv datafed-core-key.pub ${DATAFED_INSTALL_PATH}/keys/
  mv datafed-core-key.priv ${DATAFED_INSTALL_PATH}/keys/
fi

# Copy services
cp "$PROJECT_ROOT/services/datafed-core.service" /etc/systemd/system

systemctl_exists=$( which systemctl )

if [[ ! -z $systemctl_exists ]]
then
sudo systemctl daemon-reload

echo "The ArangoDB service should be up and running before you use this command"
sudo systemctl restart datafed-core.service
sudo systemctl status datafed-core.service

# Enable services on reboot
sudo systemctl enable datafed-core.service
else
  echo "Not starting systemctl service because did not find systemctl."
fi
