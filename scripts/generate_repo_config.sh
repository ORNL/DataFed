#!/bin/env bash
set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

Help()
{
  echo "$(basename $0) Will set up a configuration file for the repo server"
  echo
  echo "Syntax: $(basename $0) [-h|t|c|e|d|g]"
  echo "options:"
  echo "-h, --help                          Print this help message"
  echo "-t, --threads                       The number of threads available to the repo server"
  echo "-c, --cred-dir                      The location of the credential directory where the"
  echo "                                    private keys of the repo server are and the public"
  echo "                                    key of the core server."
  echo "-p, --port                          The port that needs to be open on the repo"
  echo "                                    server so the repo server can communicate with "
  echo "                                    the datafed server."
  echo "-d, --domain                        The DataFed fully qualified domain name and port"
  echo "                                    this is the port that is open and listening on"
  echo "                                    the core server. E.g."
  echo "                                    tcp://datafed.ornl.gov:7512"
  echo "                                    If you want to set it as an env variable you can use"
  echo "                                    the env variable DATAFED_DOMAIN."
  echo "                                    NOTE: this does not use https it uses tcp"
  echo "-g, --globus-collection-base-path   The Globus (POSIX) Base path to the Guest Collection."
}

if [ -z "${DATAFED_DOMAIN}" ]
then
  local_DATAFED_DOMAIN="datafed.ornl.gov"
else
  local_DATAFED_DOMAIN=$(printenv DATAFED_DOMAIN)
fi

if [ -z "${DATAFED_GCS_COLLECTION_BASE_PATH}" ]
then
  local_DATAFED_GCS_COLLECTION_BASE_PATH="/mnt/datafed-repo/mapped"
else
  local_DATAFED_GCS_COLLECTION_BASE_PATH=$(printenv DATAFED_GCS_COLLECTION_BASE_PATH)
fi

local_DATAFED_LOG_PATH=""

if [ -z "${DATAFED_DEFAULT_LOG_PATH}" ]
then
  local_DATAFED_LOG_PATH="/var/log/datafed"
else
  local_DATAFED_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

local_DATAFED_SERVER_PORT=""
if [ -z "${DATAFED_SERVER_PORT}" ]
then
    local_DATAFED_SERVER_PORT="7512"
else
    local_DATAFED_SERVER_PORT=$(printenv DATAFED_SERVER_PORT)
fi

local_DATAFED_CRED_DIR="${DATAFED_INSTALL_PATH}/keys/"
local_DATAFED_REPO_PORT="9000"
local_DATAFED_REPO_THREADS=2

VALID_ARGS=$(getopt -o ht:c:e:d:g: --long 'help',threads:,cred-dir:,port:,globus-collection-base-path:,datafed-domain-port: -- "$@")
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
    -t | --threads)
        echo "Processing 'threads' option. Input argument is '$2'"
        local_DATAFED_REPO_THREADS=$2
        shift 2
        ;;
    -c | --cred-dir)
        echo "Processing 'credential directory' option. Input argument is '$2'"
        local_DATAFED_CRED_DIR=$2
        shift 2
        ;;
    -p | --port)
        echo "Processing 'port' option. Input argument is '$2'"
        local_DATAFED_REPO_PORT=$2
        shift 2
        ;;
    -d | --domain)
        echo "Processing 'DataFed domain' option. Input argument is '$2'"
        local_DATAFED_DOMAIN=$2
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

CONFIG_FILE_NAME="datafed-repo.cfg"

# The repo servers address and port which should have the form
# tcp://datafed-repo.ornl.gov:9000, the repo server should have a fully
# qualified domain name and publily accessible IP address. The port should be the
# same port listed in the datafed-repo.cfg file.
cat << EOF > "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
cred-dir=$local_DATAFED_CRED_DIR
server=tcp://$local_DATAFED_DOMAIN:${local_DATAFED_SERVER_PORT}
port=$local_DATAFED_REPO_PORT
threads=$local_DATAFED_REPO_THREADS
globus-collection-path=$local_DATAFED_GCS_COLLECTION_BASE_PATH
EOF

echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
echo
echo "Contents are:"
echo 
cat "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
