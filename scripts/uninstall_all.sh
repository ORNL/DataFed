#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

# Will remove datafed components, with the exception of
# the certificates because we can only call lego so many times
rm -rf "${DATAFED_INSTALL_PATH}/core"
rm -rf "${DATAFED_INSTALL_PATH}/web"
rm -rf "${DATAFED_INSTALL_PATH}/repo"
rm -rf "${DATAFED_INSTALL_PATH}/authz"

rm -f /etc/systemd/system/datafed* 
rm -f /etc/grid-security/gsi-authz.conf
# If the path is overwritten and the value that is not found in datafed.sh
# is used to install a particular component then this will not suffice
rm -rf "${DATAFED_DEFAULT_LOG_PATH}"

"${PROJECT_ROOT}/scripts/clear_db.sh"
