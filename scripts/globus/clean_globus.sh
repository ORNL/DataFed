#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")
source "${PROJECT_ROOT}/config/datafed.sh"

if [ -z "$DATAFED_GCS_ROOT_NAME" ]; then
  echo "DATAFED_GCS_ROOT_NAME is not defined cannot run $SCRIPT"
  exit 1
fi

GATEWAY_NAME="${DATAFED_GCS_ROOT_NAME} Storage Gateway"
COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Mapped"

# Removing the mapped collection will also remove any guest collections

collection_line=$(globus-connect-server collection list | grep "$COLLECTION_NAME")
if [ ! -z "$collection_line" ]; then
  uuid_of_collection=$(globus-connect-server collection list | grep "$COLLECTION_NAME" | awk '{ print $1 }')

  globus-connect-server collection update \
    "$uuid_of_collection" \
    --no-delete-protected

  globus-connect-server collection delete "$uuid_of_collection"
fi

gateway_line=$(globus-connect-server storage-gateway list | grep "$GATEWAY_NAME")
if [ ! -z "$gateway_line" ]; then

  spaces_in_name=$(echo "$GATEWAY_NAME" | awk '{print gsub("[ \t]",""); exit}')
  columns=$(($spaces_in_name + 3))
  uuid_of_storage_gateway=$(globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')

  # Check if it already exists
  globus-connect-server storage-gateway delete "${uuid_of_storage_gateway}"
fi
