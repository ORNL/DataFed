#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

source "${SOURCE}/dependency_versions.sh"

# This script should be run after generating the .env file as it will pull
# values from the .env file
Help() {
  echo "$(basename $0) generate globus files. Note the .env file must exist."
  echo " in the specified directory."
  echo
  echo "Syntax: $(basename $0) [-h|d]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-d, --directory                   Directory where globus folder will be"
  echo "                                  created."
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
  --)
    shift
    break
    ;;
  \?) # incorrect option
    echo "Error: Invalid option"
    exit
    ;;
  esac
done

if [ ! -d "${DIRECTORY}" ]; then
  echo "The provided directory does not seem to exist: ${DIRECTORY}"
fi

if [ ! -f "${DIRECTORY}/.env" ]; then
  echo "Missing . ${DIRECTORY}/.env file. This file needs to be"
  echo "created first"
  exit 1
fi

# This script should be run after generating the .env file as it will pull
# values from the .env file

if [ ! -f "${DIRECTORY}/.env" ]; then
  echo "Missing . ${DIRECTORY}/.env file. This file needs to be"
  echo "created first"
  exit 1
fi

local_DATAFED_GLOBUS_KEY_DIR="${DIRECTORY}/globus"
if [ ! -d "$local_DATAFED_GLOBUS_KEY_DIR" ]; then
  mkdir -p "$local_DATAFED_GLOBUS_KEY_DIR"
fi

# Because docker compose honors spaces and reads in .env files as literals
# we cannot include the quotes for variables that have spaces. So we need to
# convert this file such that it is in a format that can be readable by bash
# before loading it into the env

cp "${DIRECTORY}/.env" "${DIRECTORY}/.env_shell"

sed -i 's/=\([^"]*\)/="\1"/' "${DIRECTORY}/.env_shell"

. "${DIRECTORY}/.env_shell"

# Cleanup after loading env
rm "${DIRECTORY}/.env_shell"

DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH="$DATAFED_HOST_DEPLOYMENT_KEY_PATH" \
  DATAFED_GLOBUS_CRED_FILE_PATH="$DATAFED_HOST_CRED_FILE_PATH" \
  DATAFED_GLOBUS_CONTROL_PORT="$DATAFED_GLOBUS_CONTROL_PORT" \
  DATAFED_GLOBUS_SUBSCRIPTION="$DATAFED_GLOBUS_SUBSCRIPTION" \
  DATAFED_GCS_ROOT_NAME="$DATAFED_GCS_ROOT_NAME" \
  "python${DATAFED_PYTHON_VERSION}" "${PROJECT_ROOT}/scripts/globus/initialize_globus_endpoint.py"
