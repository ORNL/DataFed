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
    chown -R datafed:root /opt/datafed/repo/
    chown -R datafed:root /mnt/datafed
fi


log_path="$DATAFED_DEFAULT_LOG_PATH"

if [ ! -d "${log_path}" ]
then
  su -c "mkdir -p ${log_path}" datafed
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

echo "Give a few minutes to debug the problem"
sleep 10000
