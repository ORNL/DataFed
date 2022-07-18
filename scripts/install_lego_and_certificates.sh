#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

Help()
{
  echo "$(basename $0) Will install lego and use Let's Encrypt to create certificates."
  echo
  echo "Syntax: $(basename $0) [-h|d|e]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-d, --domain                      The domain that let's encrypt will generate certificates for."
  echo "-e, --email                       The email address associated with the certificates."
}

EMAIL=""
DOMAIN=""

VALID_ARGS=$(getopt -o hd:e: --long 'help',domain:,email: -- "$@")
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
    -e | --email)
        echo "Processing 'email' option. Input argument is '$2'"
        EMAIL=$2
        shift 2
        ;;
    -d | --domain)
        echo "Processing 'domain' option. Input argument is '$2'"
        DOMAIN=$2
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


sudo add-apt-repository ppa:longsleep/golang-backports
sudo apt-get update
sudo apt-get install golang-go

#This was verified for go 1.17
export GO111MODULE=on
go install github.com/go-acme/lego/v4/cmd/lego@latest

#creates a folder go/bin where lego is installed
export PATH=$PATH:${SOURCE}/go/bin

# This should create a folder in ~/.lego/certificates, that contains the
# certificate files you need, we are going to copy them over to the
# /opt/datafed/keys folder
#
# NOTE: To run lego you will need to make sure that nothing else is using port 443
# it will be unable to run if the datafed webserver is also running.
sudo lego --email="$EMAIL" --domains="$DOMAIN" --tls run

# Create the folder
if [ ! -d "/opt/datafed/keys" ]
then
	sudo mkdir -p /opt/datafed/keys
fi

# copy the certificates over
sudo cp ~/.lego/certificates/datafed-server-test.ornl.gov.crt ~/.lego/certificates/datafed-server-test.ornl.gov.key /opt/datafed/keys/

