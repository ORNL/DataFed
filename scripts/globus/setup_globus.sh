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

CRED_FILE_NAME="client_cred.json"
if [ -f "$CRED_FILE_NAME" ]; then
    echo "File exists! $CRED_FILE_NAME"
else
    echo "File does not exist. $CRED_FILE_NAME"
		echo "run the Globus python script first"
		exit 1
fi

GCS_CLI_CLIENT_ID=""
GCS_CLI_CLIENT_SECRET=""

GATEWAY_NAME="${DATAFED_GCS_ROOT_NAME} Storage Gateway"
COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Mapped"
GUEST_COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Guest"

gateway_line=$( globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" )
#    {
#      "source": "{id}",
#      "match": "${DATAFED_GLOBUS_APP_ID}@clients.auth.globus.org",
#      "output": "${DATAFED_GLOBUS_REPO_USER}",
#      "ignore_case": false,
#      "literal": true
#    }
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

#DOMAINS="--domain ornl.gov --domain clients.auth.globus.org --domain gmail.com"
DOMAINS="--domain ornl.gov"

if [ -z "$gateway_line" ]
then
# Check if it already exists
  globus-connect-server storage-gateway create posix \
    "$GATEWAY_NAME" \
    ${DOMAINS}  \
    --identity-mapping file:mapping.json

else

  spaces_in_name=$(echo $GATEWAY_NAME | awk '{print gsub("[ \t]",""); exit}')
  columns=$(( $spaces_in_name + 3 ))
  uuid_of_storage_gateway=$( globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')

  globus-connect-server storage-gateway update posix \
    "$uuid_of_storage_gateway" \
    ${DOMAINS} \
    --identity-mapping file:mapping.json

fi

PATH_TO_GUEST_ROOT="${GCS_COLLECTION_ROOT_PATH}"

# Create project/ and /user folders
#mkdir -p "${PATH_TO_GUEST_ROOT}/${DATAFED_REPO_ID_AND_DIR}/user"
#mkdir -p "${PATH_TO_GUEST_ROOT}/${DATAFED_REPO_ID_AND_DIR}/project"

collection_line=$( globus-connect-server collection list | grep "$COLLECTION_NAME" )

spaces_in_name=$(echo $GATEWAY_NAME | awk '{print gsub("[ \t]",""); exit}')
columns=$(( $spaces_in_name + 3 ))
uuid_of_storage_gateway=$( globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')

if [ -z "$collection_line" ]
then

  globus-connect-server collection create \
    "$uuid_of_storage_gateway" \
    "/" \
    "$COLLECTION_NAME" \
    --allow-guest-collections \
    --enable-anonymous-writes \
    --default-directory "${GCS_COLLECTION_ROOT_PATH}" \
    --disable-https
else

  uuid_of_collection=$( globus-connect-server collection list | grep "$COLLECTION_NAME" | awk '{ print $1 }')
  
  globus-connect-server collection update \
    "$uuid_of_collection" \
    --allow-guest-collections \
    --enable-anonymous-writes \
    --default-directory "${GCS_COLLECTION_ROOT_PATH}" \
    --disable-https

fi

echo "When creating a guest collection it must be created in: $PATH_TO_GUEST_ROOT"
echo "And the display name should be exactly: $GUEST_COLLECTION_NAME"
echo "You will also need to add permissions for all Globus users so that they have write access."
echo ""
echo "When registering the repository with DataFed the ID must be: $DATAFED_REPO_ID_AND_DIR"
echo "When registering the repository with DataFed path is abs to the mapped collection and must be listed as: ${PATH_TO_GUEST_ROOT}/${DATAFED_REPO_ID_AND_DIR}"
