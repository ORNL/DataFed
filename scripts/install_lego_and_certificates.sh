#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"
source "${PROJECT_ROOT}/external/DataFedDependencies/scripts/utils.sh"

Help() {
  echo "$(basename $0) Will install lego and use Let's Encrypt to create certificates."
  echo
  echo "Syntax: $(basename $0) [-h|d|e]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-d, --domain                      The domain that let's encrypt will generate certificates for."
  echo "                                  i.e. datafed-server-test.ornl.gov, can be set with an"
  echo "                                  environmental variable as well DATAFED_DOMAIN"
  echo "-e, --email                       The email address associated with the certificates."
}

if [ -z "$DATAFED_LEGO_EMAIL" ]; then
  local_DATAFED_LEGO_EMAIL=""
else
  local_DATAFED_LEGO_EMAIL=$(printenv DATAFED_LEGO_EMAIL)
fi

if [ -z "$DATAFED_DOMAIN" ]; then
  local_DATAFED_DOMAIN="datafed.ornl.gov"
else
  local_DATAFED_DOMAIN=$(printenv DATAFED_DOMAIN)
fi

VALID_ARGS=$(getopt -o hd:e: --long 'help',domain:,email: -- "$@")
if [[ $? -ne 0 ]]; then
  exit 1
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -e | --email)
    echo "Processing 'email' option. Input argument is '$2'"
    local_DATAFED_LEGO_EMAIL=$2
    shift 2
    ;;
  -d | --domain)
    echo "Processing 'domain' option. Input argument is '$2'"
    local_DATAFED_DOMAIN=$2
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
if [ -z "$local_DATAFED_LEGO_EMAIL" ]; then
  echo "Error DATAFED_LEGO_EMAIL is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -e, --email"
  echo "      or with the environment variable DATAFED_LEGO_EMAIL."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

sudo_command

"$SUDO_CMD" add-apt-repository --yes ppa:longsleep/golang-backports
"$SUDO_CMD" apt-get update
"$SUDO_CMD" apt-get install golang-go

#This was verified for go 1.17
export GO111MODULE=on
GOBIN=/usr/local/bin/ go install github.com/go-acme/lego/v4/cmd/lego@latest

# Create the folder
if [ ! -d "${DATAFED_INSTALL_PATH}/keys" ]; then
  "$SUDO_CMD" mkdir -p "${DATAFED_INSTALL_PATH}/keys"
fi

# Check if the datafed-ws server is already running, will need to stop it if we want
# to use port 443 to start the domain name
datafed_ws_service=$(systemctl list-unit-files --type service | grep datafed-ws | awk '{print $1}')
[[ "$datafed_ws_service" == 'datafed-ws.service' ]] && "$SUDO_CMD" systemctl stop datafed-ws.service

# This should create a folder in ~/.lego/certificates, that contains the
# certificate files you need, we are going to copy them over to the
# ${DATAFED_INSTALL_PATH}/keys folder (Defalut: /opt/datafed/keys)
#
# NOTE: To run lego you will need to make sure that nothing else is using port 443
# it will be unable to run if the datafed webserver is also running.
#
# NOTE: Will only run if one of the necessary certificate files is missing
cert_file="datafed-server-test.ornl.gov.crt"
key_file="datafed-server-test.ornl.gov.key"
if [ ! -f "${DATAFED_INSTALL_PATH}/keys/$cert_file" ] || [ ! -f "${DATAFED_INSTALL_PATH}/keys/$key_file" ]; then
  "$SUDO_CMD" lego --accept-tos --email="$DATAFED_LEGO_EMAIL" --domains="$local_DATAFED_DOMAIN" --path "${DATAFED_INSTALL_PATH}/keys/" --tls run
  mv ${DATAFED_INSTALL_PATH}/keys/certificates/$cert_file ${DATAFED_INSTALL_PATH}/keys/
  mv ${DATAFED_INSTALL_PATH}/keys/certificates/$key_file ${DATAFED_INSTALL_PATH}/keys/
  rm -rf ${DATAFED_INSTALL_PATH}/keys/certificates
  rm -rf ${DATAFED_INSTALL_PATH}/keys/accounts
else
  echo "Certificate files already exist - lego will not run."
  echo "Remove these files if you would like to generate new certs:"
  echo ""
  echo "$cert_file"
  echo "$key_file"
fi
