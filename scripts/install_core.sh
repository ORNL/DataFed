#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

# Make sure paths exist
mkdir -p "${DATAFED_INSTALL_PATH}/core"
mkdir -p "${DATAFED_INSTALL_PATH}/keys"
mkdir -p "${DATAFED_DEFAULT_LOG_PATH}"

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-core.cfg" "${DATAFED_INSTALL_PATH}/core"


# Move keys to Default:/opt/datafed/keys if they do not already exist
if [ ! -f "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.priv" ]
then
  # Generate keys
  echo "No keys for core server were detected in ${DATAFED_INSTALL_PATH}/keys/ creating them"
  "${DATAFED_INSTALL_PATH}/core/datafed-core" --gen-keys
  mv datafed-core-key.pub "${DATAFED_INSTALL_PATH}/keys/"
  mv datafed-core-key.priv "${DATAFED_INSTALL_PATH}/keys/"
  mv datafed-token-key.txt "${DATAFED_INSTALL_PATH}/keys/"
fi
