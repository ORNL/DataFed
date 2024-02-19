#!/bin/bash

set -euf -o pipefail

if [ -n "$UID" ]; then
    usermod -u $UID datafed
fi

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../")

log_path="$DATAFED_DEFAULT_LOG_PATH"
if [ ! -d "${log_path}" ]
then
  su -c "mkdir -p ${log_path}" datafed
fi

cd "${PROJECT_ROOT}"
# Check to see if foxx has previously been installed
install_flag="/tmp/.foxx_is_installed"
if [ ! -f "$install_flag" ]
then
  su datafed -c "${PROJECT_ROOT}/scripts/generate_datafed.sh"

  su datafed -c "cmake -S. -B build						\
    -DBUILD_REPO_SERVER=False		\
    -DBUILD_COMMON=False        \
    -DBUILD_AUTHZ=False					\
    -DBUILD_CORE_SERVER=False		\
    -DBUILD_WEB_SERVER=False		\
    -DBUILD_DOCS=False					\
    -DBUILD_PYTHON_CLIENT=False	\
    -DBUILD_FOXX=True           \
    -DINSTALL_FOXX=True"


  su datafed -c "cmake --build build"

  # Give arango container a minute to initialize
  # should be replaced with health check at some point
  sleep 5
  su datafed -c "cmake --build build --target install"

  #if [ "$#" -eq 0 ]; then
  #  echo "No arguments were passed, running bash"
  #  exec "bash"
  #  exit 0
  #fi
  touch "$install_flag"
fi

sleep 1000
#datafed_core_exec=$(basename "$1")
#if [ "${datafed_core_exec}" = "datafed-core" ]
#then
#  # Send output to log file
#  # For this to work all commands must be passed in as a single string
#  su datafed -c '"$@"' -- argv0 "$@" 2>&1 | tee "$log_path/datafed-core.log"
#else
#  echo "Not sending output to datafed-core.log"
#  # If not do not by default send to log file
#  su datafed -c '"$@"' -- argv0 "$@"
#fi
