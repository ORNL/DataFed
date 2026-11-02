#!/bin/env bash

# The setup script must throw an error if there is a problem. This has
# implications on the CI pipelines as well as the ability to detect problems
# when standing up datafed.
# -e turns on failures if script hits a problem
set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../../)
source "${PROJECT_ROOT}/config/datafed.sh"
source "${PROJECT_ROOT}/scripts/repo_paths.sh"
datafed_load_repo_paths

# Keep diagnostics on stderr so JSON list output can still be parsed by jq.
# Print only the operation names; arguments may contain sensitive policy data.
run_gcs() {
  local status
  printf 'Globus setup: %s %s\n' "$1" "$2" >&2
  if globus-connect-server "$@"; then
    return 0
  else
    status=$?
    printf 'Globus setup: %s %s failed (exit %s). Inspect /var/log/globus-connect-server/gcs-manager/gcs.log for the server exception.\n' \
      "$1" "$2" "$status" >&2
    return "$status"
  fi
}

if [ -z "$DATAFED_GCS_ROOT_NAME" ]; then
  echo "DATAFED_GCS_ROOT_NAME is not defined cannot run $SCRIPT"
  exit 1
fi

if [ -z "$DATAFED_GCS_COLLECTION_ROOT_PATH" ]; then
  echo "DATAFED_GCS_COLLECTION_ROOT_PATH is not defined cannot run $SCRIPT"
  exit 1
fi

if [ -z "$DATAFED_REPO_ID_AND_DIR" ]; then
  echo "DATAFED_REPO_ID_AND_DIR is not defined cannot run $SCRIPT"
  exit 1
fi

if [ -z "$DATAFED_GLOBUS_CRED_FILE_PATH" ]; then
  echo "DATAFED_GLOBUS_CRED_FILE_PATH is not defined cannot run $DATAFED_GLOBUS_CRED_FILE_PATH"
  exit 1
else
  CRED_FILE_PATH="$DATAFED_GLOBUS_CRED_FILE_PATH"
fi

if [ -z "${DATAFED_GLOBUS_SUBSCRIPTION}" ]; then
  echo "DATAFED_GLOBUS_SUBSCRIPTION not defined"
  DATAFED_GLOBUS_SUBSCRIPTION=""
else
  DATAFED_GLOBUS_SUBSCRIPTION=$(printenv DATAFED_GLOBUS_SUBSCRIPTION)
fi

if [ -z "$DATAFED_GLOBUS_ALLOWED_DOMAINS" ]; then
  echo "DATAFED_GLOBUS_ALLOWED_DOMAINS is not defined shoudl be i.e. globusid.org or gmail.com or ornl.gov or cu.edu or something of the sort."
  exit 1
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

gateway_line=$(run_gcs storage-gateway list -F json | jq -er --arg name "$GATEWAY_NAME" '
  [(if type == "array" then .[] else .data[] end)
   | (if has("data") then .data[] else . end) | select(.display_name == $name)]
  | if length > 1 then error("Ambiguous storage gateway name")
    else (.[0].id // "") end')

echo "$DATAFED_GLOBUS_REPO_USER"
cat <<EOF >mapping.json
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

# For the Globus client to create the guest collection need to allow client
# from the domain
DOMAINS="--domain $DATAFED_GLOBUS_ALLOWED_DOMAINS --domain clients.auth.globus.org"

# Replace the complete policy on startup, using only explicitly configured roots.
jq -n --args '{DATA_TYPE: "path_restrictions#1.0.0", read_write: $ARGS.positional}' \
  "${DATAFED_CONFIGURED_REPO_PATHS[@]}" >path_restriction.json

if [ -z "$gateway_line" ]; then
  # Check if it already exists
  run_gcs storage-gateway create posix \
    "$GATEWAY_NAME" \
    ${DOMAINS} \
    --restrict-paths file:path_restriction.json \
    --identity-mapping file:mapping.json

else

  uuid_of_storage_gateway="$gateway_line"

  run_gcs storage-gateway update posix \
    "$uuid_of_storage_gateway" \
    --restrict-paths file:path_restriction.json \
    ${DOMAINS} \
    --identity-mapping file:mapping.json

fi

# Create project/ and /user folders
for repo_path in "${DATAFED_CONFIGURED_REPO_PATHS[@]}"; do
  mkdir -p -- "$repo_path/user" "$repo_path/project"
done

collection_line=$(run_gcs collection list -F json | jq -er --arg name "$COLLECTION_NAME" '
  [(if type == "array" then .[] else .data[] end)
   | (if has("data") then .data[] else . end) | select(.display_name == $name)]
  | if length > 1 then error("Ambiguous mapped collection name")
    else (.[0].id // "") end')
uuid_of_storage_gateway=$(run_gcs storage-gateway list -F json | jq -er --arg name "$GATEWAY_NAME" '
  [(if type == "array" then .[] else .data[] end)
   | (if has("data") then .data[] else . end) | select(.display_name == $name)]
  | if length == 1 then .[0].id else error("Expected one storage gateway") end')

# If not empty
extra_collection_arg=""
if [ -n "${DATAFED_GLOBUS_SUBSCRIPTION}" ]; then
  run_gcs endpoint set-subscription-id "${DATAFED_GLOBUS_SUBSCRIPTION}"
  extra_collection_arg="--allow-guest-collections"
fi

if [ -z "$collection_line" ]; then

  # NOTE enable-anonymous-writes is allowed without a subscription
  # NOTE allow-guest-collections requires a subscription
  run_gcs collection create \
    "$uuid_of_storage_gateway" \
    "/" \
    "$COLLECTION_NAME" \
    --enable-anonymous-writes \
    --default-directory "/" \
    --disable-https "$extra_collection_arg"
else

  uuid_of_collection="$collection_line"
  # NOTE enable-anonymous-writes is allowed without a subscription
  # NOTE allow-guest-collections requires a subscription
  run_gcs collection update \
    "$uuid_of_collection" \
    --enable-anonymous-writes \
    --default-directory "/" \
    --disable-https "$extra_collection_arg"
fi

echo "Storage gateway configured for these repository filesystem paths:"
for repo_path in "${DATAFED_CONFIGURED_REPO_PATHS[@]}"; do
  printf '  %s\n' "$repo_path"
done
printf 'Guest collection: %s\n' "$GUEST_COLLECTION_NAME"
printf 'Guest collection base: %s\n' "${DATAFED_GCS_COLLECTION_BASE_PATH:-/}"
echo "DataFed registration forms will be generated after guest collection setup."
