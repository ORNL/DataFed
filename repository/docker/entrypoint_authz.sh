#!/bin/bash

# Entrypoint for running gcs should be in root
# To run it just pass in /entrypoint.sh as an argument
set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../..)
# Translate datafed env variables to globus env variables

export DATAFED_GCS_COLLECTION_ROOT_PATH=/mnt/datafed
# This env variables are needed for running globus-connect-server without
# logging in

export GCS_CLI_CLIENT_ID=$(jq -r .client < /opt/datafed/globus/client_cred.json)
export GCS_CLI_CLIENT_SECRET=$(jq -r .secret < /opt/datafed/globus/client_cred.json)
export GCS_CLI_ENDPOINT_ID=$(jq -r .client_id < /opt/datafed/globus/deployment-key.json)

export DEPLOYMENT_KEY_PATH="/opt/datafed/globus/deployment-key.json"
# These env variables are for running the gcs entrypoint file

export GLOBUS_CLIENT_ID=$(jq -r .client < /opt/datafed/globus/client_cred.json)
export GLOBUS_CLIENT_SECRET=$(jq -r .secret < /opt/datafed/globus/client_cred.json)
export DEPLOYMENT_KEY=$(cat "$DEPLOYMENT_KEY_PATH"  )

if [ -n "$UID" ]; then
    echo "Switching datafed user to UID: ${UID}"
    usermod -u $UID datafed
    chown -R datafed:root ${DATAFED_GCS_COLLECTION_ROOT_PATH}
fi

"${PROJECT_ROOT}/scripts/generate_datafed.sh"

source "${PROJECT_ROOT}/config/datafed.sh"

# After datafed.sh has been run created
"${PROJECT_ROOT}/scripts/generate_authz_config.sh"

# Make sure paths exist
mkdir -p "${DATAFED_INSTALL_PATH}/keys"
mkdir -p "${DATAFED_DEFAULT_LOG_PATH}"

# Copy configuration files
cp "$PROJECT_ROOT/config/gsi-authz.conf" /etc/grid-security
cp "$PROJECT_ROOT/config/datafed-authz.cfg" "${DATAFED_INSTALL_PATH}/authz"

# Run node setup command we have to use the entrypoint file for this because
# the globus-connect-server node setup command attempts to use systemctl which
# is not installed in the container

# Make sure files did not persist from a previous docker compose run
# This code block is used for cleaning up files that might have been cached by
# docker compose. These files are not always appropraitely removed when the 
# Globus container exits.
#
# List of files to delete
files=("/run/gcs_manager" "/run/gcs_manager/pid" "/var/run/apache2/apache2.pid"
  "/var/run/httpd/httpd.pid" "/run/globus-gridftp-server.pid")
# Loop over the list of files
for file in "${files[@]}"; do
  if [ -e "$file" ]; then
    echo "Removing $file"
    rm -rf "$file"
  fi
done
link="/run/gcs_manager.sock"
if [ -L "$link" ]; then
  echo "Removing symbolic link $link"
  rm "$link"
fi

# Run the GCS entrypoint file in the background
/entrypoint.sh &

# NOTE - can only change the tcp control port after setting up the end point
# But will probably need a firewall exception for that port
# globus-connect-server endpoint update  --gridftp-control-channel-port "443"

# Make sure globus-gridftp-server is running before running setup_globus
data=$(ps aux | awk '{print $11}' | grep apache2 || true)
while [ -z "${data}" ]
do
        data=$(ps aux | awk '{print $11}' | grep apache2 || true)
        echo "Waiting for apache2 to start running"
        sleep 1
done
echo "apache2 service found to be running!"

# Needs a few seconds
while [ ! -f /run/globus-gridftp-server.pid ]
do
  echo "Waiting for globus-gridftp-server pid file to be created"
  sleep 1
done
echo "globus-gridftp-server pid file found!"

# Need to wait until the domain name is properly registered
DATAFED_GCS_URL=$(jq -r .domain_name < /var/lib/globus-connect-server/info.json)

HTTP_CODE=$("${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/curl" -s -o /dev/null -w "%{http_code}\n" -I "https://${DATAFED_GCS_URL}/api/info")
echo "Waiting for domain name (https://${DATAFED_GCS_URL}) to be registered! Code: $HTTP_CODE"
printf "\n"
minutes=0
while [ "$HTTP_CODE" != "200" ]
do

	EraseToEOL=$(tput el)

	msg="Minutes $minutes "
	for i in {1..12}
	do
			printf "%s" "${msg}"
			msg='.'
			sleep 5
	
			HTTP_CODE=$("${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/curl" -s -o /dev/null  -w "%{http_code}\n" -I "https://${DATAFED_GCS_URL}/api/info")
			if [ "$HTTP_CODE" == "200" ]
			then
				break
			fi	
	done
	printf "\r${EraseToEOL}"

	minutes=$((minutes + 1))
  HTTP_CODE=$("${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/curl" -s -o /dev/null -w "%{http_code}\n" -I "https://${DATAFED_GCS_URL}/api/info")
done
printf "\n"

log_path="$DATAFED_DEFAULT_LOG_PATH"

if [ ! -d "${log_path}" ]
then
  mkdir -p "${log_path}"
fi

if [ ! -d "${DATAFED_GCS_COLLECTION_ROOT_PATH}" ]
then
  mkdir -p "$DATAFED_GCS_COLLECTION_ROOT_PATH"
  chown -R datafed:root ${DATAFED_GCS_COLLECTION_ROOT_PATH}
fi

"${BUILD_DIR}/scripts/globus/setup_globus.sh"

source "${DATAFED_PYTHON_ENV}/bin/activate"
# Must be passed in directly
GCS_CLI_ENDPOINT_ID="$GCS_CLI_ENDPOINT_ID" \
DATAFED_GCS_URL="$DATAFED_GCS_URL" \
GCS_CLI_CLIENT_ID="$GCS_CLI_CLIENT_ID" \
GCS_CLI_CLIENT_SECRET="$GCS_CLI_CLIENT_SECRET" \
DATAFED_REPO_USER="$DATAFED_REPO_USER" \
  python3 "${BUILD_DIR}/scripts/globus/create_guest_collection.py"

"${BUILD_DIR}/scripts/globus/generate_repo_form.sh"

echo "Container is running."

# Return to last file
tail -f "${DATAFED_DEFAULT_LOG_PATH}/datafed-gsi-authz.log"
