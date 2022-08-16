#!/bin/env bash

# Not do not include "-u" in set option, we will be checking for unbound variables
# if that option is set then this script will throw an error when there is none
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

echo "SOURCE Is $SOURCE"
Help()
{
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|t|c|f]"
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
  echo "-z, --zeromq-session-secret       ZeroMQ session secret"
  echo "-y, --zeromq-system-secret        ZeroMQ system secret"
  echo "-w, --web-cert-path               Path to web server certificate file."
  echo "-k, --web-key-path                Path to web server key file."
}

# Set defaults use environment variables by default


local_DATAFED_WEB_CERT_PATH="/opt/datafed/keys/datafed-server-test.ornl.gov.crt"
local_DATAFED_WEB_KEY_PATH="/opt/datafed/keys/datafed-server-test.ornl.gov.key"

local_DATAFED_SERVER_PORT="443"

if [ -z "${DATAFED_GLOBUS_APP_ID}" ]
then
  local_DATAFED_SERVER_DOMAIN_NAME="datafed.ornl.gov"
else
  local_DATAFED_SERVER_DOMAIN_NAME=$(printenv DATAFED_DOMAIN)
fi

if [ -z "${DATAFED_GLOBUS_APP_ID}" ]
then
  local_DATAFED_GLOBUS_APP_ID=""
else
  local_DATAFED_GLOBUS_APP_ID=$(printenv DATAFED_GLOBUS_APP_ID)
fi

if [ -z "${DATAFED_GLOBUS_APP_SECRET}" ]
then
  local_DATAFED_GLOBUS_APP_SECRET=""
else
  local_DATAFED_GLOBUS_APP_SECRET=$(printenv DATAFED_GLOBUS_APP_SECRET)
fi

if [ -z "${DATAFED_ZEROMQ_SESSION_SECRET}" ]
then
  local_DATAFED_ZEROMQ_SESSION_SECRET=""
else
  local_DATAFED_ZEROMQ_SESSION_SECRET=$(printenv DATAFED_ZEROMQ_SESSION_SECRET)
fi

if [ -z "${DATAFED_ZEROMQ_SYSTEM_SECRET}" ]
then
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=""
else
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=$(printenv DATAFED_ZEROMQ_SYSTEM_SECRET)
fi

VALID_ARGS=$(getopt -o hs:i:z:y:w:k: --long 'help',globus-secret:,globus-id:,zeromq-session-secret:,zeromq-system-secret:,web-cert-path:,web-key-path -- "$@")
if [[ $? -ne 0 ]]; then
      exit 1;
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
    -z | --zeromq-session-secret)
        echo "Processing 'DataFed ZeroMQ session secret' option. Input argument is '$2'"
        local_DATAFED_ZEROMQ_SESSION_SECRET=$2
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
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

ERROR_DETECTED=0
if [ -z "$local_DATAFED_GLOBUS_APP_SECRET" ]
then
  echo "Error DATAFED_GLOBUS_APP_SECRET is not defined, this is a required argument."
  echo "      This variable can be set using the command line option -s, --globus-secret"
  echo "      or with the environment variable DATAFED_GLOBUS_APP_SECRET."
  ERROR_DETECTED=1
fi

if [ -z "$local_DATAFED_GLOBUS_APP_ID" ]
then
  echo "Error DATAFED_GLOBUS_APP_ID is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -i, --globus-id"
  echo "      or with the environment variable DATAFED_GLOBUS_APP_ID."
  ERROR_DETECTED=1
fi

if [ -z "$local_DATAFED_ZEROMQ_SESSION_SECRET" ]
then
  echo "Error DATAFED_ZEROMQ_SESSION_SECRET is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -z, --zeromq-session-secret"
  echo "      or with the environment variable DATAFED_ZEROMQ_SESSION_SECRET."
  ERROR_DETECTED=1
fi

if [ -z "$local_DATAFED_ZEROMQ_SYSTEM_SECRET" ]
then
  echo "Error DATAFED_ZEROMQ_SYSTEM_SECRET is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -y, --zeromq-session-secret"
  echo "      or with the environment variable DATAFED_ZEROMQ_SYSTEM_SECRET."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]
then
  exit 1
fi

PATH_TO_CONFIG_DIR=$(realpath "$SOURCE/../config")

CONFIG_FILE_NAME="datafed-ws.cfg"

cat << EOF > "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
# Note this file can be generated with $(basename $0)
[server]
host=https://${local_DATAFED_SERVER_DOMAIN_NAME}
port=${local_DATAFED_SERVER_PORT}
# These are the certificates generated by let's encrypt so that
# HTTPS is enabled. There is third key value pair if the certificates
# do not include the intermediate certificates.
#
# Example
# chain_file=/opt/datafed/keys/DigiCertSHA2SecureServerCA.pem
key_file=${local_DATAFED_WEB_KEY_PATH}
cert_file=${local_DATAFED_WEB_CERT_PATH}
# This is the secret used by Zero0MQ and must be consistent 
system_secret=${local_DATAFED_ZEROMQ_SYSTEM_SECRET}
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
# port 7513
server_address=tcp://localhost:7513
EOF

echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
echo
echo "Contents are:"
echo 
cat "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
