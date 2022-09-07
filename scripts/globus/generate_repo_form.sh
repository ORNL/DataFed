#!/bin/env bash

set -uf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../../)
source ${PROJECT_ROOT}/config/datafed.sh

if [ -z "$DATAFED_GCS_ROOT_NAME" ]
then
  echo "DATAFED_GCS_ROOT_NAME is not defined in ${PROJECT_ROOT}/config/datafed.sh cannot run $SCRIPT."
  exit 1
fi

if [ -z "$GCS_COLLECTION_ROOT_PATH" ]
then
  echo "GCS_COLLECTION_ROOT_PATH is not defined cannot run $SCRIPT"
  exit 1
fi

if [ -z "$DATAFED_REPO_ID_AND_DIR" ]
then
  echo "DATAFED_REPO_ID_AND_DIR is not defined cannot run $SCRIPT"
  exit 1
fi

# Check that the repo service has been installed
if [ ! -f "/opt/datafed/keys/datafed-repo-key.pub" ]
then
  echo "Cannot generate repository form if the repo service has not been installed."
  echo "NOTE: This script should be run form the same machine as the repo service"
  echo "and the globus connect server"
fi

public_key=$(cat /opt/datafed/keys/datafed-repo-key.pub)

GATEWAY_NAME="${DATAFED_GCS_ROOT_NAME} Storage Gateway"
GUEST_COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Guest"
MAPPED_COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Mapped"
PATH_TO_GUEST_ROOT="${GCS_COLLECTION_ROOT_PATH}"

uuid_of_collection=$( globus-connect-server collection list | grep "$GUEST_COLLECTION_NAME" | awk '{ print $1 }')

if [ -z "$uuid_of_collection" ]
then
  echo "Unable to generate form, you need to first create a guest collection"
  echo "inside '$MAPPED_COLLECTION_NAME' with name '$GUEST_COLLECTION_NAME'."
  echo "The guest collection must be located at $PATH_TO_GUEST_ROOT, which is"
  echo "equivalent to relative path '/'"
  exit 1
fi

# Probably should grab this from the config file
local_DATAFED_REPO_EGRESS_PORT="9000"
repo_domain_name=$(domainname -A | xargs)

if [ -z "$repo_domain_name" ]
then
  echo "Unable to identify domain name of server."
fi

echo "DataFed Repo Form Registration Contents"
echo "ID: $DATAFED_REPO_ID_AND_DIR"
echo "Title: Whatever you want to call it"
echo "Description: A description of the repository."
# Should be something like this: tcp://datafed-gcs-test.ornl.gov:9000
# This is the domain name of the repository server
echo "Srvr. Address: tcp://$repo_domain_name:$local_DATAFED_REPO_EGRESS_PORT"
echo "Public Key: $public_key"
echo "End-point ID: $uuid_of_collection"
echo "Path: /$DATAFED_REPO_ID_AND_DIR"
echo "Domain: "
# I don't know what this is
echo "Export Path: "
echo "Capacity: The capacity of the repository"
