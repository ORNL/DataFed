#!/bin/env bash
# Cannot run with -u because we check for unbound variables
# and the script will exit prematurely if '-u' is set
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

Help()
{
  echo "$(basename $0) Will set up a configuration file for the repo server"
  echo
  echo "Syntax: $(basename $0) [-h|r|d|p]"
  echo "options:"
  echo "-h, --help                          Print this help message"
  echo "-r, --repo-id                       The repository id i.e. /repo/core"
  echo "                                    This is the path in the Globus endpoint."
  echo "-d, --domain                        The DataFed fully qualified domain"
  echo "                                    this is the port that is open and listening on"
  echo "                                    the core server. E.g."
  echo "                                    datafed.ornl.gov"
  echo "                                    It can also be set using the DATAFED_DOMAIN env variable."
  echo "                                    NOTE: this does not use https it uses tcp."
  echo "-p, --port                          The DataFed port."
  echo "-u, --user                          The user the authz module will run as."
  echo "-g, --globus-collection-base-path   The POSIX path to the Guest Globus Collection."
}

REPO_ID="datafed-home"

if [ -z "${DATAFED_DEFAULT_LOG_PATH}" ]
then
  local_DATAFED_LOG_PATH="/var/log/datafed"
else
  local_DATAFED_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

if [ -z "DATAFED_DOMAIN" ]
then
  local_DATAFED_DOMAIN="datafed.ornl.gov"
else
  local_DATAFED_DOMAIN=$(printenv DATAFED_DOMAIN)
fi

if [ -z "DATAFED_SERVER_PORT" ]
then
  # This is the port that is open and listening on"
  # the core server."
  local_DATAFED_SERVER_PORT="7512"
else
  local_DATAFED_SERVER_PORT=$(printenv DATAFED_SERVER_PORT)
fi

if [ -z "${DATAFED_GCS_COLLECTION_BASE_PATH}" ]
then
  local_DATAFED_GCS_COLLECTION_BASE_PATH="/mnt/datafed-repo/mapped"
else
  local_DATAFED_GCS_COLLECTION_BASE_PATH=$(printenv DATAFED_GCS_COLLECTION_BASE_PATH)
fi

if [ -z "${DATAFED_GLOBUS_REPO_USER}" ]
then
  local_DATAFED_AUTHZ_USER="$DATAFED_GLOBUS_REPO_USER"
else
  local_DATAFED_AUTHZ_USER=$(printenv DATAFED_GLOBUS_REPO_USER)
fi


VALID_ARGS=$(getopt -o hr:d:g: --long 'help',repo-id:,user:,domain:,globus-collection-path -- "$@")
if [[ $? -ne 0 ]]; then
      exit 1;
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
    -h | --help)
        Help
        exit 0
        ;;
    -r | --repo-id)
        echo "Processing 'repo id' option. Input argument is '$2'"
        REPO_ID=$2
        shift 2
        ;;
    -d | --domain)
        echo "Processing 'DataFed domain' option. Input argument is '$2'"
        local_DATAFED_DOMAIN=$2
        shift 2
        ;;
    -p | --port)
        echo "Processing 'DataFed port' option. Input argument is '$2'"
        local_DATAFED_SERVER_PORT=$2
        shift 2
        ;;
    -u | --user)
        echo "Processing 'DataFed user' option. Input argument is '$2'"
        local_DATAFED_AUTHZ_USER=$2
        shift 2
        ;;
    -g | --globus-collection-base-path)
        echo "Processing 'Globus Collection Base Path' option. Input argument is '$2'"
        local_DATAFED_GCS_COLLECTION_BASE_PATH=$2
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

PATH_TO_CONFIG_DIR=$(realpath "$SOURCE/../config")
CONFIG_FILE_NAME="datafed-authz.cfg"

cat << EOF > "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
log_path=${local_DATAFED_LOG_PATH}/datafed-gsi-authz.log
server_address=tcp://${local_DATAFED_DOMAIN}:${local_DATAFED_SERVER_PORT}
server_key=${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub
repo_id=repo/$DATAFED_REPO_ID_AND_DIR
pub_key=${DATAFED_INSTALL_PATH}/keys/datafed-repo-key.pub
priv_key=${DATAFED_INSTALL_PATH}/keys/datafed-repo-key.priv
user=$local_DATAFED_AUTHZ_USER
globus-collection-path=$local_DATAFED_GCS_COLLECTION_BASE_PATH
EOF

echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
echo
echo "Contents are:"
echo 
cat "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
# Configuration for GridFTP DataFed AuthZ callout module (dll)


