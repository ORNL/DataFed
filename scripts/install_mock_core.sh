#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

# Make sure paths exist
mkdir -p "${DATAFED_INSTALL_PATH}/tests/mock_core/source"
mkdir -p "${DATAFED_INSTALL_PATH}/keys"
mkdir -p "${DATAFED_DEFAULT_LOG_PATH}"

# Move keys to Default:/opt/datafed/keys if they do not already exist
if [ ! -f "${DATAFED_INSTALL_PATH}/keys/datafed-mock-core-key.priv" ]; then
  # Generate keys
  echo "No keys for mock core server were detected in ${DATAFED_INSTALL_PATH}/keys/ creating them"
  "${DATAFED_INSTALL_PATH}/tests/mock_core/source/datafed-mock-core" --gen-keys
  mv datafed-mock-core-key.pub "${DATAFED_INSTALL_PATH}/keys/"
  mv datafed-mock-core-key.priv "${DATAFED_INSTALL_PATH}/keys/"
fi
