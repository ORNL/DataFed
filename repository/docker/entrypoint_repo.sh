#!/bin/bash

set -euf -o pipefail
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../..")

"${PROJECT_ROOT}/scripts/generate_datafed.sh"
"${PROJECT_ROOT}/scripts/generate_repo_config.sh"
"${PROJECT_ROOT}/scripts/install_repo.sh"

# This is only part of the solution the other part is running chown
if [ -n "$UID" ]; then
    echo "Switching datafed user to UID: ${UID}"
    usermod -u "$UID" datafed
    chown -R datafed:root "${PROJECT_ROOT}"
    chown -R datafed:root "${DATAFED_INSTALL_PATH}/repo/"
    chown -R datafed:root "${DATAFED_GCS_COLLECTION_BASE_PATH}"
fi


log_path="$DATAFED_DEFAULT_LOG_PATH"

if [ ! -d "${log_path}" ]
then
  su -c "mkdir -p ${log_path}" datafed
fi

if [ ! -f "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub" ]
then
  echo "datafed-core-key.pub not found, downloading from the core server"
  wget --no-check-certificate "https://${DATAFED_DOMAIN}/datafed-core-key.pub" -P "${DATAFED_INSTALL_PATH}/keys/"
fi

datafed_repo_exec=$(basename "$1")
if [ "${datafed_repo_exec}" = "datafed-repo" ]
then
  # Send output to log file
  # For this to work all commands must be passed in as a single string
  su datafed -c '"$@"' -- argv0 "$@" 2>&1 | tee "$log_path/datafed-repo.log"
else
  echo "Not sending output to datafed-core.log"
  # If not do not by default send to log file
  su datafed -c '"$@"' -- argv0 "$@"
fi

# Allow the container to exist for a bit in case we need to jump in and look 
# around
echo "Container sleeping"
sleep 10000
echo "Container exiting after sleep"
