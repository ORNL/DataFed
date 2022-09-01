#!/bin/env bash

set -uf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../../)
source ${PROJECT_ROOT}/config/datafed.sh

if [ -z "$DATAFED_GCS_ROOT_NAME" ]
then
  echo "DATAFED_GCS_ROOT_NAME is not defined cannot run $SCRIPT"
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

GATEWAY_NAME="${DATAFED_GCS_ROOT_NAME} Storage Gateway"
COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Mapped"

gateway_line=$( globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" )

cat << EOF > mapping.json 
{
  "DATA_TYPE": "expression_identity_mapping#1.0.0",
  "mappings": [
    {
      "source": "{username}",
      "match": "(.*)",
      "output": "cades",
      "ignore_case": false,
      "literal": false
    }]
}
EOF

if [ -z "$gateway_line" ]
then
# Check if it already exists
  globus-connect-server storage-gateway create posix \
    "$GATEWAY_NAME" \
    --domain ornl.gov --domain clients.auth.globus.org \
    --identity-mapping file:mapping.json

else

  spaces_in_name=$(echo $GATEWAY_NAME | awk '{print gsub("[ \t]",""); exit}')
  columns=$(( $spaces_in_name + 3 ))
  uuid_of_storage_gateway=$( globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')

  globus-connect-server storage-gateway update posix \
    "$uuid_of_storage_gateway" \
    --domain ornl.gov --domain clients.auth.globus.org \
    --identity-mapping file:mapping.json

fi

path_restrictions_file="path_restrictions.json"

RELATIVE_PATH_TO_GUEST_ROOT="/mapped"
PATH_TO_GUEST_ROOT="${GCS_COLLECTION_ROOT_PATH}${RELATIVE_PATH_TO_GUEST_ROOT}"
mkdir -p "${PATH_TO_GUEST_ROOT}/${DATAFED_REPO_ID_AND_DIR}"

collection_line=$( globus-connect-server collection list | grep "$COLLECTION_NAME" )

spaces_in_name=$(echo $GATEWAY_NAME | awk '{print gsub("[ \t]",""); exit}')
columns=$(( $spaces_in_name + 3 ))
uuid_of_storage_gateway=$( globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')

# Remember the restricted path is relative to the root of the mapped collection
cat << EOF > $path_restrictions_file
{
  "DATA_TYPE": "path_restrictions#1.0.0",
  "read_write": [
    "${RELATIVE_PATH_TO_GUEST_ROOT}"
  ]
}
EOF

if [ -z "$collection_line" ]
then

  globus-connect-server collection create \
    "$uuid_of_storage_gateway" \
    "$PATH_TO_GUEST_ROOT" \
    "$COLLECTION_NAME" \
    --sharing-restrict-paths "file:$path_restrictions_file" \
    --allow-guest-collections \
    --enable-anonymous-writes \
    --disable-https
else

  uuid_of_collection=$( globus-connect-server collection list | grep "$COLLECTION_NAME" | awk '{ print $1 }')
  
  globus-connect-server collection update \
    "$uuid_of_collection" \
    --sharing-restrict-paths "file:$path_restrictions_file" \
    --allow-guest-collections \
    --enable-anonymous-writes \
    --disable-https

fi

echo "When creating a guest collection it must be created in: $PATH_TO_GUEST_ROOT which should simply be '/'"
echo "When registering the repository with DataFed the ID must be: $DATAFED_REPO_ID_AND_DIR"
echo "When registering the repository with DataFed the path is relative to the mapped collection and must be listed as: /$DATAFED_REPO_ID_AND_DIR"
