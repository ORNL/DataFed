#!/bin/bash

set -euf -o pipefail

if [ -n "$UID" ]; then
    usermod -u $UID datafed
fi

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../..")

env

"${PROJECT_ROOT}/scripts/generate_datafed.sh"
"${PROJECT_ROOT}/scripts/generate_core_config.sh"
"${PROJECT_ROOT}/scripts/install_core.sh"

log_path="$DATAFED_DEFAULT_LOG_PATH"

if [ ! -d "${log_path}" ]
then
  su -c "mkdir -p ${log_path}" datafed
fi

echo "Number of arguments is $#"
echo "arguments are $@"

if [ "$#" -eq 0 ]; then
  echo "No arguments were passed, running bash"
  exec "bash"
  exit 0
fi

datafed_core_exec=$(basename "$1")
if [ "${datafed_core_exec}" = "datafed-core" ]
then
  # Send output to log file
  # For this to work all commands must be passed in as a single string
  su datafed -c '"$@"' -- argv0 "$@" 2>&1 | su datafed -c "tee $log_path/datafed-core.log"
else
  echo "Not sending output to datafed-core.log"
  # If not do not by default send to log file
  su datafed -c '"$@"' -- argv0 "$@"
fi

echo "Give a few minutes to debug the problem"
sleep 10000
