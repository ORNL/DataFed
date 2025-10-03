#!/bin/bash

set -uf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"
source "${SOURCE}/dependency_versions.sh"
source "${SOURCE}/dependency_install_functions.sh"

#NVM_DIR=/home/cades/.nvm
#[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
#export NVM_DIR="/home/cades/.nvm"
#source ${NVM_DIR}/nvm.sh
# Make sure paths exist
mkdir -p "${DATAFED_INSTALL_PATH}/web"
mkdir -p "${DATAFED_INSTALL_PATH}/keys"
mkdir -p "${DATAFED_DEFAULT_LOG_PATH}"

# Install web node modules
cp "$PROJECT_ROOT/web/package.json" "${DATAFED_INSTALL_PATH}/web/"
install_nvm
install_node
install_foxx_cli
{
  npm --allow-root --unsafe-perm --prefix "${DATAFED_INSTALL_PATH}/web" install
} || {
  echo "ERROR npm command failed!"
  exit 1
}

# Install javascript web server repo and core server were
# already installed by CMake
cp "$PROJECT_ROOT/web/datafed-ws.js" "${DATAFED_INSTALL_PATH}/web"

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-ws.cfg" "${DATAFED_INSTALL_PATH}/web"

# Make sure that the datafed-core-pub.key exists in the web/static folder
if [[ -z "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub" ]]; then
  echo "ERROR unable to locate datafed-core-key.pub in ${DATAFED_INSTALL_PATH}/keys the public key is needed by the web server exiting"
  exit 1
fi

cp "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub" "$DATAFED_INSTALL_PATH/web/static/"
