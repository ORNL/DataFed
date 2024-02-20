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
  
  touch "$install_flag"
fi

sleep 1000

