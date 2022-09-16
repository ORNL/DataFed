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
  echo "-h, --help                        Print this help message"
  echo "-t, --threads                     The number of threads available to the repo server"
  echo "-c, --cred-dir                    The location of the credential directory where the"
  echo "                                  private keys of the repo server are and the public"
  echo "                                  key of the core server."
  echo "-e, --egress-port                 The egress port that needs to be open on the repo"
  echo "                                  server so the repo server can communicate with "
  echo "                                  the datafed server."
  echo "-d, --domain                      The DataFed fully qualified domain name and port"
  echo "                                  this is the port that is open and listening on"
  echo "                                  the core server. E.g."
  echo "                                  tcp://datafed.ornl.gov:7512"
  echo "                                  If you want to set it as an env variable you can use"
  echo "                                  the env variable DATAFED_DOMAIN."
  echo "                                  NOTE: this does not use https it uses tcp"
  echo "-g, --globus-collection-path      The POSIX path to the Guest Globus Collection."
}

local_DATAFED_PORT="7512"
if [ -z "${DATAFED_DOMAIN}" ]
then
  local_DATAFED_DOMAIN="datafed.ornl.gov"
else
  local_DATAFED_DOMAIN=$(printenv DATAFED_DOMAIN)
fi

if [ -z "${GCS_COLLECTION_ROOT_PATH}" ]
then
  local_GCS_COLLECTION_ROOT_PATH="/mnt/datafed-repo/mapped"
else
  local_GCS_COLLECTION_ROOT_PATH=$(printenv GCS_COLLECTION_ROOT_PATH)
fi

local_DATAFED_LOG_PATH=""

if [ -z "${DATAFED_DEFAULT_LOG_PATH}" ]
then
  local_DATAFED_LOG_PATH="/var/log/datafed"
else
  local_DATAFED_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

local_DATAFED_CRED_DIR="/opt/datafed/keys/"
local_DATAFED_REPO_EGRESS_PORT="9000"
local_DATAFED_REPO_THREADS=2

VALID_ARGS=$(getopt -o ht:c:e:d: --long 'help',threads:,cred-dir:,egress-port:,datafed-domain-port: -- "$@")
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
    -e | --egress-port)
        echo "Processing 'egress port' option. Input argument is '$2'"
        local_DATAFED_REPO_EGRESS_PORT=$2
        shift 2
        ;;
    -d | --datafed-domain-port)
        echo "Processing 'DataFed domain' option. Input argument is '$2'"
        local_DATAFED_DOMAIN=$2
        shift 2
        ;;
    -g | --globus-collection-path)
        echo "Processing 'Globus Collection Path' option. Input argument is '$2'"
        local_GCS_COLLECTION_ROOT_PATH=$2
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

cat << EOF > "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
log-path=${local_DATAFED_LOG_PATH}
cred-dir=$local_DATAFED_CRED_DIR
server=tcp://$local_DATAFED_DOMAIN:${local_DATAFED_PORT}
port=$local_DATAFED_REPO_EGRESS_PORT
threads=$local_DATAFED_REPO_THREADS
globus-collection-path=$local_GCS_COLLECTION_ROOT_PATH
EOF

#globus-collection-path=$PATH_TO_GUEST_ROOT
echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
echo
echo "Contents are:"
echo 
cat "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
