#!/bin/env bash
set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

Help()
{
  echo "$(basename $0) Will set up a configuration file for the repo server"
  echo
  echo "Syntax: $(basename $0) [-h|t|c|e|d]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-t, --threads                     The number of threads available to the repo server"
  echo "-c, --cred-dir                    The location of the credential directory where the"
  echo "                                  private keys of the repo server are and the public"
  echo "                                  key of the core server."
  echo "-e, --egress-port                 The egress port that needs to be open on the repo"
  echo "                                  server so the repo server can communicate with "
  echo "                                  the datafed server."
  echo "-d, --datafed-domain-port         The DataFed fully qualified domain name and port"
  echo "                                  this is the port that is open and listening on"
  echo "                                  the core server. E.g."
  echo "                                  tcp://datafed.ornl.gov:7512"
  echo "                                  NOTE: this does not use https it uses tcp"
}

DATAFED_CRED_DIR="/opt/datafed/keys/"
DATAFED_SERVER_DOMAIN_NAME_AND_PORT="tcp://datafed.ornl.gov:7512"
DATAFED_REPO_EGRESS_PORT="9000"
DATAFED_REPO_THREADS=2

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
        DATAFED_REPO_THREADS=$2
        shift 2
        ;;
    -c | --cred-dir)
        echo "Processing 'credential directory' option. Input argument is '$2'"
        DATAFED_CRED_DIR=$2
        shift 2
        ;;
    -e | --egress-port)
        echo "Processing 'egress port' option. Input argument is '$2'"
        DATAFED_REPO_EGRESS_PORT=$2
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

CONFIG_FILE_NAME="datafed-repo.cfg"

cat << EOF > "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
cred-dir=$DATAFED_CRED_DIR
server=$DATAFED_SERVER_DOMAIN_NAME_AND_PORT
port=$DATAFED_REPO_EGRESS_PORT
threads=$DATAFED_REPO_THREADS
EOF

echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
echo
echo "Contents are:"
echo 
cat "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
