#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

# This script should be run after generating the .env file as it will pull
# values from the .env file

if [ ! -f "${PROJECT_ROOT}/compose/.env" ]
then
  echo "Missing . ${PROJECT_ROOT}/compose/.env file. This file needs to be"
  echo "created first"
  exit 1
fi

local_DATAFED_GLOBUS_KEY_DIR="${PROJECT_ROOT}/compose/globus"
if [ ! -d "$local_DATAFED_GLOBUS_KEY_DIR" ]
then
  mkdir -p "$local_DATAFED_GLOBUS_KEY_DIR"
fi

. "${PROJECT_ROOT}/compose/.env"

DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH="$DATAFED_HOST_DEPLOYMENT_KEY_PATH" \
DATAFED_GLOBUS_CRED_FILE_PATH="$DATAFED_HOST_CRED_FILE_PATH" \
DATAFED_GLOBUS_CONTROL_PORT="$DATAFED_GLOBUS_CONTROL_PORT" \
DATAFED_GLOBUS_SUBSCRIPTION="$DATAFED_GLOBUS_SUBSCRIPTION" \
DATAFED_GCS_ROOT_NAME="$DATAFED_GCS_ROOT_NAME" \
   python3 "${PROJECT_ROOT}/scripts/globus/initialize_globus_endpoint.py"
