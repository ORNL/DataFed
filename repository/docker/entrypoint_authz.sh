#!/bin/bash

# Entrypoint for running gcs should be in root
# To run it just pass in /entrypoint.sh as an argument
set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../..)
# Translate datafed env variables to globus env variables

# Do not set DATAFED_GCS_COLLECTION_ROOT_PATH here, it should be defined in 
# the Dockerfile as an env variable

# The env variables below are needed for running globus-connect-server without
# interactively logging in
export GCS_CLI_CLIENT_ID=$(jq -r .client < /opt/datafed/globus/client_cred.json)
export GCS_CLI_CLIENT_SECRET=$(jq -r .secret < /opt/datafed/globus/client_cred.json)
export GCS_CLI_ENDPOINT_ID=$(jq -r .client_id < /opt/datafed/globus/deployment-key.json)

export DEPLOYMENT_KEY_PATH="/opt/datafed/globus/deployment-key.json"
# These env variables are for running the gcs entrypoint file

export GLOBUS_CLIENT_ID=$(jq -r .client < /opt/datafed/globus/client_cred.json)
export GLOBUS_CLIENT_SECRET=$(jq -r .secret < /opt/datafed/globus/client_cred.json)
export DEPLOYMENT_KEY=$(cat "$DEPLOYMENT_KEY_PATH"  )

if [ "$BUILD_WITH_METADATA_SERVICES" == "TRUE" ]
then

cat <<EOF >> /etc/apache2/sites-available/000-default.conf

# vim: syntax=apache ts=4 sw=4 sts=4 sr noet
# This block is needed if core web services are running on the same machine as
# the GCS
<VirtualHost *:443>
		ServerName ${DATAFED_DOMAIN}
 
    SSLEngine on
    SSLCertificateFile /opt/datafed/keys/cert.crt
    SSLCertificateKeyFile /opt/datafed/keys/cert.key
 
    # SSL configuration
    SSLProtocol TLSv1.2 TLSv1.3
    SSLCipherSuite EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH
    SSLHonorCipherOrder on
 
    # Proxy settings
    ProxyPass / https://localhost:8080/
    ProxyPassReverse / https://localhost:8080/
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
 
    # Additional proxy SSL settings
    SSLProxyEngine on
    SSLProxyVerify none
    SSLProxyCheckPeerCN off
    SSLProxyCheckPeerName off
    SSLProxyCheckPeerExpire off
 
    SSLProxyVerifyDepth 2
    SSLProxyCACertificateFile /opt/datafed/keys/cert.crt

</VirtualHost>

EOF
fi

if [ -n "$UID" ]; then
    echo "Switching datafed user to UID: ${UID}"
    usermod -u $UID datafed
    # All files should be owned by the datafed user
    chown -R datafed:root ${DATAFED_DIR}
    chown -R datafed:root ${DATAFED_INSTALL_PATH}/authz
fi

if [ ! -f "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub" ]
then
  echo "datafed-core-key.pub not found, downloading from the core server"
  wget --no-check-certificate "https://${DATAFED_DOMAIN}/datafed-core-key.pub" -P "${DATAFED_INSTALL_PATH}/keys/"
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

export NODE_SETUP_ARGS="--ip-address ${DATAFED_GCS_IP}"
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
set +e
HTTP_CODE=$("${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/curl" -s -o /dev/null -w "%{http_code}\n" -I "https://${DATAFED_GCS_URL}/api/info")
echo "curl exit code: $?"
set -e
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
  
      set +e
      HTTP_CODE=$("${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/curl" -s -o /dev/null  -w "%{http_code}\n" -I "https://${DATAFED_GCS_URL}/api/info")
      set -e
      if [ "$HTTP_CODE" == "200" ]
      then
        break
      fi  
  done
  printf "\r${EraseToEOL}"

  minutes=$((minutes + 1))
  set +e
  HTTP_CODE=$("${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/curl" -s -o /dev/null -w "%{http_code}\n" -I "https://${DATAFED_GCS_URL}/api/info")
  set -e
done
printf "\n"

log_path="$DATAFED_DEFAULT_LOG_PATH"

if [ ! -d "${log_path}" ]
then
  mkdir -p "${log_path}"
fi

if [ ! -d "${DATAFED_GCS_COLLECTION_ROOT_PATH}" ]
then
  mkdir -p ""${DATAFED_GCS_COLLECTION_ROOT_PATH}/${DATAFED_REPO_ID_AND_DIR}""
  chown -R datafed:root "${DATAFED_GCS_COLLECTION_ROOT_PATH}/${DATAFED_REPO_ID_AND_DIR}"
fi

# Run this as the dataflow user
# setup globus command will also create the folders /proeject and user
# -m - is for preserving the environment
su -m -c "${BUILD_DIR}/scripts/globus/setup_globus.sh" datafed

source "${DATAFED_PYTHON_ENV}/bin/activate"
source "${BUILD_DIR}/dependency_versions.sh"

# Must be passed in directly
GCS_CLI_ENDPOINT_ID="$GCS_CLI_ENDPOINT_ID" \
DATAFED_GCS_COLLECTION_BASE_PATH="$DATAFED_GCS_COLLECTION_BASE_PATH" \
DATAFED_GCS_URL="$DATAFED_GCS_URL" \
GCS_CLI_CLIENT_ID="$GCS_CLI_CLIENT_ID" \
GCS_CLI_CLIENT_SECRET="$GCS_CLI_CLIENT_SECRET" \
DATAFED_REPO_USER="$DATAFED_REPO_USER" \
  "python${DATAFED_PYTHON_VERSION}" "${BUILD_DIR}/scripts/globus/create_guest_collection.py"

"${BUILD_DIR}/scripts/globus/generate_repo_form.sh" -j -s

# Why is this approach being used? 
# 
# Wild card expansion with *form was not working from within the script.
find /opt/datafed/authz/ -name '*form.json' -or -name '*form.sh' | while read -r file; do
    if [ -e "$file" ]; then
        echo "Moving $file to /opt/datafed/globus/"
        mv "$file" /opt/datafed/globus/
    else
        echo "No matching files found for pattern: $file"
    fi
done

echo "Container is running."

# Return to last file
tail -f "${DATAFED_DEFAULT_LOG_PATH}/datafed-gsi-authz.log"

