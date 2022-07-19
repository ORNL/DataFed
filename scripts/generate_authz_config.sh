#!/bin/env bash
set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

Help()
{
  echo "$(basename $0) Will set up a configuration file for the repo server"
  echo
  echo "Syntax: $(basename $0) [-h|r|d]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-r, --repo-id                     The repository id i.e. /repo/core"
  echo "                                  This is the path in the Globus endpoint."
  echo "-d, --datafed-domain-port         The DataFed fully qualified domain name and port"
  echo "                                  this is the port that is open and listening on"
  echo "                                  the core server. E.g."
  echo "                                  tcp://datafed.ornl.gov:7512"
  echo "                                  NOTE: this does not use https it uses tcp"
}

REPO_ID="/repo/core"
DATAFED_SERVER_DOMAIN_NAME_AND_PORT="tcp://datafed.ornl.gov:7512"

VALID_ARGS=$(getopt -o hr:d: --long 'help',repo-id:,datafed-domain-port: -- "$@")
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
    -d | --datafed-domain-port)
        echo "Processing 'DataFed domain and port' option. Input argument is '$2'"
        DATAFED_SERVER_DOMAIN_NAME_AND_PORT=$2
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
server_address=$DATAFED_SERVER_DOMAIN_NAME_AND_PORT
server_key=/opt/datafed/keys/datafed-core-key.pub
repo_id=$REPO_ID
pub_key=/opt/datafed/keys/datafed-repo-key.pub
priv_key=/opt/datafed/keys/datafed-repo-key.priv
EOF

echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
echo
echo "Contents are:"
echo 
cat "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
# Configuration for GridFTP DataFed AuthZ callout module (dll)


