#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

source "${SOURCE}/dependency_versions.sh"

# This script should be run after generating the .env file as it will pull
# values from the .env file
Help()
{
  echo "$(basename $0) cleanup globus files. Note the .env file must exist."
  echo " in the specified directory."
  echo
  echo "Syntax: $(basename $0) [-h|d]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-d, --directory                   Directory where globus folder is."
}

VALID_ARGS=$(getopt -o hd: --long 'help',directory: -- "$@")

DIRECTORY=""
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
    -h | --help)
        Help
        exit 0
        ;;
    -d | --directory)
        DIRECTORY="$2"
        shift 2
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

if [ ! -d "${DIRECTORY}" ]
then
  echo "The provided directory does not seem to exist: ${DIRECTORY}"
fi

if [ ! -f "${DIRECTORY}/.env" ]
then
  echo "Missing . ${DIRECTORY}/.env file. This file needs to be"
  echo "created first"
  exit 1
fi

. "${DIRECTORY}/.env"

export DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH="$DATAFED_HOST_DEPLOYMENT_KEY_PATH"
export DATAFED_GLOBUS_CRED_FILE_PATH="$DATAFED_HOST_CRED_FILE_PATH"

if [ -f "$DATAFED_HOST_CRED_FILE_PATH" ]
then
  export GCS_CLI_CLIENT_ID=$(jq -r .client < "${DATAFED_HOST_CRED_FILE_PATH}")
  export GCS_CLI_CLIENT_SECRET=$(jq -r .secret < "${DATAFED_HOST_CRED_FILE_PATH}")
fi

if [ -f "$DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH" ]
then
  export GCS_CLI_ENDPOINT_ID=$(jq -r .client_id < "${DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH}")
fi

sudo globus-connect-server node cleanup

DATAFED_GCS_ROOT_NAME="$DATAFED_GCS_ROOT_NAME" \
"python${DATAFED_PYTHON_VERSION}" "${PROJECT_ROOT}/scripts/globus/globus_cleanup.py"
