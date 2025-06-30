#!/bin/bash
# Setup Globus Connect Server storage gateways and collections

set -euo pipefail

# Load environment variables
GCS_ROOT_NAME="${GCS_ROOT_NAME:-GCS Endpoint}"
GCS_COLLECTION_NAME="${GCS_COLLECTION_NAME:-${GCS_ROOT_NAME} Collection}"
GCS_COLLECTION_ROOT_PATH="${GCS_COLLECTION_ROOT_PATH:-/mnt/globus-collections}"
GCS_ALLOWED_DOMAINS="${GCS_ALLOWED_DOMAINS:-globusid.org}"
LOCAL_USER="${LOCAL_USER:-globus}"
GLOBUS_SUBSCRIPTION_ID="${GLOBUS_SUBSCRIPTION_ID:-}"

GATEWAY_NAME="${GCS_ROOT_NAME} Storage Gateway"
GUEST_COLLECTION_NAME="${GCS_ROOT_NAME} Guest Collection"

echo "=== Globus Connect Server Setup ==="
echo "Gateway Name: ${GATEWAY_NAME}"
echo "Collection Name: ${GCS_COLLECTION_NAME}"
echo "Collection Path: ${GCS_COLLECTION_ROOT_PATH}"
echo "Local User: ${LOCAL_USER}"
echo

# Create identity mapping file
# Maps all Globus users to the local user
cat > /tmp/mapping.json <<EOF
{
  "DATA_TYPE": "expression_identity_mapping#1.0.0",
  "mappings": [
    {
      "source": "{username}",
      "match": "(.*)",
      "output": "${LOCAL_USER}",
      "ignore_case": false,
      "literal": false
    }
  ]
}
EOF

# Create path restriction file
cat > /tmp/path_restriction.json <<EOF
{
  "DATA_TYPE": "path_restrictions#1.0.0",
  "read_write": ["${GCS_COLLECTION_ROOT_PATH}"]
}
EOF

# Build domain arguments
DOMAIN_ARGS=""
IFS=',' read -ra DOMAINS <<< "$GCS_ALLOWED_DOMAINS"
for domain in "${DOMAINS[@]}"; do
    DOMAIN_ARGS="$DOMAIN_ARGS --domain $domain"
done
# Always allow clients.auth.globus.org for the client to manage collections
DOMAIN_ARGS="$DOMAIN_ARGS --domain clients.auth.globus.org"

# Check if storage gateway exists
gateway_line=$(globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" || echo "")
if [ -z "$gateway_line" ]; then
    echo "Creating storage gateway: ${GATEWAY_NAME}"
    globus-connect-server storage-gateway create posix \
        "$GATEWAY_NAME" \
        $DOMAIN_ARGS \
        --restrict-paths file:/tmp/path_restriction.json \
        --identity-mapping file:/tmp/mapping.json
else
    echo "Storage gateway already exists, updating..."
    # Extract UUID from the list output
    spaces_in_name=$(echo $GATEWAY_NAME | awk '{print gsub("[ \t]",""); exit}')
      columns=$(( $spaces_in_name + 3 ))
    gateway_uuid=$( globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')
    
    globus-connect-server storage-gateway update posix \
        "$gateway_uuid" \
        --restrict-paths file:/tmp/path_restriction.json \
        $DOMAIN_ARGS \
        --identity-mapping file:/tmp/mapping.json
fi

# Get storage gateway UUID
spaces_in_name=$(echo $GATEWAY_NAME | awk '{print gsub("[ \t]",""); exit}')
columns=$(( $spaces_in_name + 3 ))
gateway_uuid=$(globus-connect-server storage-gateway list | grep "$GATEWAY_NAME" | awk -v col=$columns '{ print $col }')
echo "Storage Gateway UUID: $gateway_uuid"

# Create necessary directories
echo "Creating collection directories..."
mkdir -p "${GCS_COLLECTION_ROOT_PATH}/user"
mkdir -p "${GCS_COLLECTION_ROOT_PATH}/project"
chown -R ${LOCAL_USER}:${LOCAL_USER} "${GCS_COLLECTION_ROOT_PATH}"

# Check if collection exists
collection_line=$(globus-connect-server collection list | grep "$GCS_COLLECTION_NAME" || echo "")

# Set subscription if provided
if [ -n "${GLOBUS_SUBSCRIPTION_ID}" ]; then
    echo "Setting subscription ID: ${GLOBUS_SUBSCRIPTION_ID}"
    globus-connect-server endpoint set-subscription-id "${GLOBUS_SUBSCRIPTION_ID}"
    EXTRA_COLLECTION_ARGS="--allow-guest-collections"
else
    echo "No subscription ID provided, guest collections will not be available"
    EXTRA_COLLECTION_ARGS=""
fi

if [ -z "$collection_line" ]; then
    echo "Creating collection: ${GCS_COLLECTION_NAME}"
    # NOTE enable-anonymous-writes is allowed without a subscription
    # NOTE allow-guest-collections requires a subscription
    globus-connect-server collection create \
        "$gateway_uuid" \
        "/" \
        "$GCS_COLLECTION_NAME" \
        --enable-anonymous-writes \
        --default-directory "/" \
        --disable-https \
        $EXTRA_COLLECTION_ARGS
else
    echo "Collection already exists, updating..."
    collection_uuid=$(globus-connect-server collection list | grep "$GCS_COLLECTION_NAME" | awk '{print $1}')
    # NOTE enable-anonymous-writes is allowed without a subscription
    # NOTE allow-guest-collections requires a subscription
    globus-connect-server collection update \
        "$collection_uuid" \
        --enable-anonymous-writes \
        --default-directory "/" \
        --disable-https \
        $EXTRA_COLLECTION_ARGS
fi

# Get collection UUID for reference
collection_uuid=$(globus-connect-server collection list | grep "$GCS_COLLECTION_NAME" | awk '{print $1}')

echo
echo "=== Setup Complete ==="
echo "Storage Gateway UUID: $gateway_uuid"
echo "Collection UUID: $collection_uuid"
echo "Collection Path: ${GCS_COLLECTION_ROOT_PATH}"
echo
echo "Next steps:"
echo "1. If you have a subscription, create a guest collection at: ${GCS_COLLECTION_ROOT_PATH}"
echo "2. The guest collection display name should be: ${GUEST_COLLECTION_NAME}"
echo "3. Grant permissions to users/groups as needed"

# Clean up temporary files
rm -f /tmp/mapping.json /tmp/path_restriction.json