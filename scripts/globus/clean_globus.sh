#!/bin/bash
set -e -o pipefail

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

# This removes the shared mapped collection (including guest collections) and
# gateway for ALL repositories served by this instance. Match complete names so
# another instance with a similar name is never selected.
resource_id() {
  jq -er --arg name "$2" '
    (if type == "array" then . else .data end)
    | map(select(.display_name == $name))
    | if length == 0 then ""
      elif length == 1 then .[0].id
      else error("Multiple Globus resources have the same display name") end
  ' <<< "$1"
}

# Resolve both before making any changes; ambiguity must fail closed.
uuid_of_collection=$(resource_id "$(globus-connect-server collection list --format json)" "$COLLECTION_NAME")
uuid_of_storage_gateway=$(resource_id "$(globus-connect-server storage-gateway list --format json)" "$GATEWAY_NAME")

if [ -n "$uuid_of_collection" ]; then
  globus-connect-server collection update "$uuid_of_collection" --no-delete-protected
  globus-connect-server collection delete "$uuid_of_collection"
fi
if [ -n "$uuid_of_storage_gateway" ]; then
  globus-connect-server storage-gateway delete "$uuid_of_storage_gateway"
fi
