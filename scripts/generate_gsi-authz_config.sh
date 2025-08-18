#!/bin/env bash
# Cannot run with -u because we check for unbound variables
# and the script will exit prematurely if '-u' is set
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

PATH_TO_CONFIG_DIR=$(realpath "$SOURCE/../config")
CONFIG_FILE_NAME="gsi-authz.conf"

cat <<EOF >"$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
GLOBUS_GSI_AUTHZ_SYSTEM_INIT           $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_authz_init
GLOBUS_GSI_AUTHZ_SYSTEM_DESTROY        $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_authz_destroy
GLOBUS_GSI_AUTHZ_HANDLE_INIT           $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_authz_handle_init
GLOBUS_GSI_AUTHORIZE_ASYNC             $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_authz_authorize_async
GLOBUS_GSI_AUTHZ_CANCEL                $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_authz_cancel
GLOBUS_GSI_AUTHZ_HANDLE_DESTROY        $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_authz_handle_destroy
GLOBUS_GSI_GET_AUTHORIZATION_IDENTITY  $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_authz_identify
globus_mapping                         $DATAFED_INSTALL_PATH/authz/libdatafed-authz gsi_map_user
EOF

echo
echo "gsi-conf file is being placed here: $PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
echo
echo "Contents are:"
echo
cat "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
