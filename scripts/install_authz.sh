#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

# Make sure paths exist
mkdir -p "${DATAFED_INSTALL_PATH}/keys"
mkdir -p "${DATAFED_DEFAULT_LOG_PATH}"

# Copy configuration files
cp "$PROJECT_ROOT/config/gsi-authz.conf" /etc/grid-security
cp "$PROJECT_ROOT/config/datafed-authz.cfg" "${DATAFED_INSTALL_PATH}/authz"

# Ensure permissions are correctly set on authz library
chmod 755 "${DATAFED_INSTALL_PATH}/authz/libdatafed-authz.so"

# Update GridFTP so it knows about env variable
PATTERN1="("
PATTERN2=";"
PATH_GRIDFTP_SERVICE=$(sudo systemctl status globus-gridftp-server.service | grep "loaded (" | awk '{print $3}' | sed -e "s/.*$PATTERN1\(.*\)$PATTERN2.*/\1/")
echo "$PATH_GRIDFTP_SERVICE"
