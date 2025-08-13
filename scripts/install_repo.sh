#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

# Make sure paths exist
mkdir -p "${DATAFED_INSTALL_PATH}/repo"
mkdir -p "${DATAFED_INSTALL_PATH}/keys"
mkdir -p "${DATAFED_DEFAULT_LOG_PATH}"

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-repo.cfg" "${DATAFED_INSTALL_PATH}/repo"

# Generate keys only if they do not exist
if [ ! -f "${DATAFED_INSTALL_PATH}/keys/datafed-repo-key.priv" ]; then
  "${DATAFED_INSTALL_PATH}/repo/datafed-repo" --gen-keys --cred-dir "${DATAFED_INSTALL_PATH}/keys"
fi
