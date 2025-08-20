#!/bin/bash

# Not do not include "-u" in set option, we will be checking for unbound variables
# if that option is set then this script will throw an error when there is none
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

echo "SOURCE Is $SOURCE"
Help() {
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|s|i|z|y|w|k|t]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-s, --globus-secret               Globus App secret used by DataFed to authenticate"
  echo "                                  with Globus. This is a REQUIRED parameter. If it"
  echo "                                  is not provided as a command line argument it can "
  echo "                                  be set as an environment variable called"
  echo "                                  DATAFED_GLOBUS_APP_SECRET"
  echo "-i, --globus-id                   Globus App client id used by DataFed to help Globus"
  echo "                                  identify the DataFed application as a Globus app."
  echo "                                  This is a REQUIRED parameter. If it is not provided"
  echo "                                  as a command line argument it can be set as an "
  echo "                                  environment variable called"
  echo "                                  DATAFED_GLOBUS_APP_ID"
  echo "-c, --core-address-port           The web server needs to know where to find the core"
  echo "                                  server. Valid entries include:"
  echo "                                  localhost:7513"
  echo "                                  127.0.0.1:7513"
  echo "                                  datafed.ornl.gov:7513"
  echo "                                  The default is to use the domain name and port 7513."
  echo "-z, --zeromq-session-secret       ZeroMQ session secret"
  echo "-y, --zeromq-system-secret        ZeroMQ system secret"
  echo "-w, --web-cert-path               Path to web server certificate file."
  echo "-k, --web-key-path                Path to web server key file."
  echo "-t, --google-analytics-tag        The tag associated with a Google Analytics stream"
}

# Set defaults use environment variables by default
local_DATAFED_WEB_CERT_PATH="${DATAFED_INSTALL_PATH}/keys/datafed-server-test.ornl.gov.crt"
local_DATAFED_WEB_KEY_PATH="${DATAFED_INSTALL_PATH}/keys/datafed-server-test.ornl.gov.key"

if [ ! -z "${DATAFED_WEB_KEY_PATH}" ]; then
  local_DATAFED_WEB_KEY_PATH=$(printenv DATAFED_WEB_KEY_PATH)
fi

if [ ! -z "${DATAFED_WEB_CERT_PATH}" ]; then
  local_DATAFED_WEB_CERT_PATH=$(printenv DATAFED_WEB_CERT_PATH)
fi

if [ -z "${DATAFED_DOMAIN}" ]; then
  local_DATAFED_SERVER_DOMAIN_NAME="datafed.ornl.gov"
else
  local_DATAFED_SERVER_DOMAIN_NAME=$(printenv DATAFED_DOMAIN)
fi

if [ -z "${DATAFED_HTTPS_SERVER_PORT}" ]; then
  local_DATAFED_HTTPS_SERVER_PORT="443"
else
  local_DATAFED_HTTPS_SERVER_PORT=$(printenv DATAFED_HTTPS_SERVER_PORT)
fi

if [ -z "${DATAFED_GLOBUS_APP_ID}" ]; then
  local_DATAFED_GLOBUS_APP_ID=""
else
  local_DATAFED_GLOBUS_APP_ID=$(printenv DATAFED_GLOBUS_APP_ID)
fi

if [ -z "${DATAFED_GLOBUS_APP_SECRET}" ]; then
  local_DATAFED_GLOBUS_APP_SECRET=""
else
  local_DATAFED_GLOBUS_APP_SECRET=$(printenv DATAFED_GLOBUS_APP_SECRET)
fi

if [ -z "${DATAFED_ZEROMQ_SESSION_SECRET}" ]; then
  local_DATAFED_ZEROMQ_SESSION_SECRET=""
else
  local_DATAFED_ZEROMQ_SESSION_SECRET=$(printenv DATAFED_ZEROMQ_SESSION_SECRET)
fi

local_DATAFED_LOG_PATH=""
if [ -z "${DATAFED_DEFAULT_LOG_PATH}" ]; then
  local_DATAFED_LOG_PATH="/var/log/datafed"
else
  local_DATAFED_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

if [ -z "${DATAFED_CORE_ADDRESS_PORT_INTERNAL}" ]; then
  local_DATAFED_CORE_ADDRESS_PORT_INTERNAL="${local_DATAFED_SERVER_DOMAIN_NAME}:7513"
else
  local_DATAFED_CORE_ADDRESS_PORT_INTERNAL=$(printenv DATAFED_CORE_ADDRESS_PORT_INTERNAL)
fi

if [ -z "${DATAFED_GOOGLE_ANALYTICS_TAG}" ]; then
  local_DATAFED_GOOGLE_ANALYTICS_TAG=""
else
  local_DATAFED_GOOGLE_ANALYTICS_TAG=$(printenv DATAFED_GOOGLE_ANALYTICS_TAG)
fi

VALID_ARGS=$(getopt -o hs:i:z:y:w:k:c:t: --long 'help',globus-secret:,globus-id:,zeromq-session-secret:,zeromq-system-secret:,web-cert-path:,web-key-path:,core-address-port:,google-analytics-tag: -- "$@")
if [[ $? -ne 0 ]]; then
  exit 1
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  echo "$1"
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -s | --globus-secret)
    echo "Processing 'DataFed Globus App secret' option. Input argument is '$2'"
    local_DATAFED_GLOBUS_APP_SECRET=$2
    shift 2
    ;;
  -i | --globus-id)
    echo "Processing 'DataFed Globus App client id' option. Input argument is '$2'"
    local_DATAFED_GLOBUS_APP_ID=$2
    shift 2
    ;;
  -y | --zeromq-system-secret)
    echo "Processing 'DataFed ZeroMQ system secret' option. Input argument is '$2'"
    local_DATAFED_ZEROMQ_SYSTEM_SECRET=$2
    shift 2
    ;;
  -w | --web-cert-path)
    echo "Processing 'DataFed web certificate path' option. Input argument is '$2'"
    local_DATAFED_WEB_CERT_PATH=$2
    shift 2
    ;;
  -k | --web-key-path)
    echo "Processing 'DataFed web key path' option. Input argument is '$2'"
    local_DATAFED_WEB_KEY_PATH=$2
    shift 2
    ;;
  -c | --core-address-port)
    echo "Processing 'DataFed internal core address and port' option. Input argument is '$2'"
    local_DATAFED_CORE_ADDRESS_PORT_INTERNAL=$2
    shift 2
    ;;
  -t | --google-analytics-tag)
    echo "Processing 'DataFed Google Analytics tag' option. Input argument is '$2'"
    local_DATAFED_GOOGLE_ANALYTICS_TAG=$2
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

ERROR_DETECTED=0
if [ -z "$local_DATAFED_GLOBUS_APP_SECRET" ]; then
  echo "Error DATAFED_GLOBUS_APP_SECRET is not defined, this is a required argument."
  echo "      This variable can be set using the command line option -s, --globus-secret"
  echo "      or with the environment variable DATAFED_GLOBUS_APP_SECRET."
  ERROR_DETECTED=1
fi

if [ -z "$local_DATAFED_GLOBUS_APP_ID" ]; then
  echo "Error DATAFED_GLOBUS_APP_ID is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -i, --globus-id"
  echo "      or with the environment variable DATAFED_GLOBUS_APP_ID."
  ERROR_DETECTED=1
fi

if [ -z "$local_DATAFED_ZEROMQ_SESSION_SECRET" ]; then
  echo "Error DATAFED_ZEROMQ_SESSION_SECRET is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -z, --zeromq-session-secret"
  echo "      or with the environment variable DATAFED_ZEROMQ_SESSION_SECRET."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

PATH_TO_CONFIG_DIR=$(realpath "$SOURCE/../config")

CONFIG_FILE_NAME="datafed-ws.cfg"

cat <<EOF >"$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
# Note this file can be generated with $(basename $0)
[server]
host=${local_DATAFED_SERVER_DOMAIN_NAME}
port=${local_DATAFED_HTTPS_SERVER_PORT}
# Path where log files will be placed
log-path=${local_DATAFED_LOG_PATH}
# These are the certificates generated by let's encrypt so that
# HTTPS is enabled. There is third key value pair if the certificates
# do not include the intermediate certificates.
#
# Example
# chain_file=/opt/datafed/keys/DigiCertSHA2SecureServerCA.pem
key_file=${local_DATAFED_WEB_KEY_PATH}
cert_file=${local_DATAFED_WEB_CERT_PATH}
# This is the secret used by Zero0MQ and must be consistent 
session_secret=${local_DATAFED_ZEROMQ_SESSION_SECRET}
extern_url=https://${local_DATAFED_SERVER_DOMAIN_NAME}

[oauth]
# Below are the client ids and secrets which are obtained when you
# register an application with Globus, these values should be consistent
# with what is in the datafed-core.cfg file
client_id=${local_DATAFED_GLOBUS_APP_ID}
client_secret=${local_DATAFED_GLOBUS_APP_SECRET}

[core]
# This is the address to talk with the core server which is listening on 
# port 7513, assuming internal network.
server_address=tcp://${local_DATAFED_CORE_ADDRESS_PORT_INTERNAL}

[operations]
# This is the tag associated with a Google Analytics installation that metrics will be sent to.
google_analytics_tag=${local_DATAFED_GOOGLE_ANALYTICS_TAG}
EOF

echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
echo
echo "Contents are:"
echo
cat "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
