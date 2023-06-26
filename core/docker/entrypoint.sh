#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../..)

${PROJECT_ROOT}/scripts/generate_datafed.sh
${PROJECT_ROOT}/scripts/generate_core_config.sh
${PROJECT_ROOT}/scripts/install_core.sh

log_path="$DATAFED_DEFAULT_LOG_PATH"

if [ "$#" -eq 0 ]; then
  echo "No arguments were passed, running bash"
  exec "bash"
  exit 0
fi

datafed_core_exec=$(basename "$1")
if [ "${datafed_core_exec}" = "datafed-core" ]
then
  # Send output to log file
  "$@"  2>&1 | tee "$log_path/datafed-core.log"
else
  echo "Not sending output to datafed-core.log"
  # If not do not by default send to log file
  exec "$@"
fi
