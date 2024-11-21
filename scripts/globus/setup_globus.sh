#!/bin/env bash

set -uf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}"/../../)
source "${PROJECT_ROOT}"/config/datafed.sh

check_var() {
  if [ -z "$1" ]; then
    echo "$2 is not defined cannot run $SCRIPT"
    exit 1
  fi
}

create_json() {
  cat << EOF > "$1"
{
  "DATA_TYPE": "$2",
  "read_write": [ "$3" ]
}
EOF
}

manage_gateway() {
  GATEWAY_NAME="$1"
  PATH_RESTRICTION="$2"
  ALLOWED_DOMAINS="$3"
  gateway_line=$(globus-connect-server storage-gateway list | grep "$GATEWAY_NAME")

  if [ -z "$gateway_line" ]; then
    globus-connect-server storage-gateway create posix \
    "$GATEWAY_NAME" \
    "${ALLOWED_DOMAINS}"  \
    --restrict-paths file:"$PATH_RESTRICTION" \
    --identity-mapping file:mapping.json
  else
    spaces_in_name=$(echo "$GATEWAY_NAME" | awk '{print gsub("[ \t]",""); exit}')
    columns=$(( "$spaces_in_name" + 3 ))
    uuid_of_storage_gateway=$(echo "$gateway_line" | awk -v col=$columns '{ print $col }')

    globus-connect-server storage-gateway update posix \
    "$uuid_of_storage_gateway" \
    "${ALLOWED_DOMAINS}"  \
    --restrict-paths file:"$PATH_RESTRICTION" \
    --identity-mapping file:mapping.json
  fi
}

manage_collection() {
  COLLECTION_NAME="$1"
  GATEWAY_NAME="$2"
  collection_line=$(globus-connect-server collection list | grep "$COLLECTION_NAME")
  spaces_in_name=$(echo "$COLLECTION_NAME" | awk '{print gsub("[ \t]",""); exit}')
  columns=$(( "$spaces_in_name" + 3 ))
  uuid_of_storage_gateway=$(globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')

  if [ -z "$collection_line" ]; then
    globus-connect-server collection create \
    "$uuid_of_storage_gateway" \
    "/" \
    "$COLLECTION_NAME" \
    --enable-anonymous-writes \
    --default-directory "/" \
    --disable-https $extra_collection_arg
  else
    uuid_of_collection=$(echo "$collection_line" | awk '{print $1}')

    globus-connect-server collection update \
    "$uuid_of_collection" \
    --enable-anonymous-writes \
    --default-directory "/" \
    --disable-https $extra_collection_arg
  fi
}

####
# Variables
####
check_var "$DATAFED_GCS_ROOT_NAME" "DATAFED_GCS_ROOT_NAME"
check_var "$DATAFED_GCS_COLLECTION_ROOT_PATH" "DATAFED_GCS_COLLECTION_ROOT_PATH"
check_var "$DATAFED_REPO_ID_AND_DIR" "DATAFED_REPO_ID_AND_DIR"
check_var "$DATAFED_GLOBUS_ALLOWED_DOMAINS" "DATAFED_GLOBUS_ALLOWED_DOMAINS"
DATAFED_GLOBUS_SUBSCRIPTION=${DATAFED_GLOBUS_SUBSCRIPTION:-""}
if [ -z "$DATAFED_GLOBUS_CRED_FILE_PATH" ]
then
  echo "DATAFED_GLOBUS_CRED_FILE_PATH is not defined cannot run $DATAFED_GLOBUS_CRED_FILE_PATH"
  exit 1
else
  CRED_FILE_PATH="$DATAFED_GLOBUS_CRED_FILE_PATH"
fi
if [ -f "$CRED_FILE_PATH" ]; then
  echo "File exists! $CRED_FILE_PATH"
else
  echo "File does not exist. $CRED_FILE_PATH"
  echo "run the Globus python script first"
  exit 1
fi
GATEWAY_NAME="${DATAFED_GCS_ROOT_NAME} Storage Gateway"
COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Mapped"
GUEST_COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Guest"
DOMAINS="--domain $DATAFED_GLOBUS_ALLOWED_DOMAINS --domain clients.auth.globus.org" # For the Globus client to create the guest collection need to allow client from the domain

####
# Create project/ and /user folders
####
mkdir -p "${DATAFED_GCS_COLLECTION_ROOT_PATH}/${DATAFED_REPO_ID_AND_DIR}/user"
mkdir -p "${DATAFED_GCS_COLLECTION_ROOT_PATH}/${DATAFED_REPO_ID_AND_DIR}/project"

####
# JSON File
####
create_json "path_restriction.json" "path_restrictions#1.0.0" "${DATAFED_GCS_COLLECTION_ROOT_PATH}/staging"

echo "$DATAFED_GLOBUS_REPO_USER"
cat << EOF > mapping.json
{
  "DATA_TYPE": "expression_identity_mapping#1.0.0",
  "mappings": [
    {
      "source": "{username}",
      "match": "(.*)",
      "output": "${DATAFED_GLOBUS_REPO_USER}",
      "ignore_case": false,
      "literal": false
    }
  ]
}
EOF

manage_gateway "${GATEWAY_NAME}" "path_restriction.json" "${DOMAINS}"

if [ -n "$DATAFED_GLOBUS_SUBSCRIPTION" ]; then
  echo "Setting subscription"
  globus-connect-server endpoint set-subscription-id "$DATAFED_GLOBUS_SUBSCRIPTION"
  extra_collection_arg="--allow-guest-collections"
else
  extra_collection_arg=""
fi

manage_collection "${COLLECTION_NAME}" "${DATAFED_GCS_ROOT_NAME} Storage Gateway"

echo "When creating a guest collection it must be created in: $DATAFED_GCS_COLLECTION_ROOT_PATH"
echo "And the display name should be exactly: $GUEST_COLLECTION_NAME"
echo "You will also need to add permissions for all Globus users so that they have write access."
echo ""
echo "When registering the repository with DataFed the ID must be: $DATAFED_REPO_ID_AND_DIR"
echo "When registering the repository with DataFed path is abs to the mapped collection and must be listed as: ${DATAFED_GCS_COLLECTION_ROOT_PATH}/${DATAFED_REPO_ID_AND_DIR}"
