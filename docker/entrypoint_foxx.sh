#!/bin/bash

set -euf -o pipefail

# NOTE We do not need to change the user in this container because we should not have
# any log output, and running chmod to update all the folders during runtime is
# expensive!
# 
# The following lines are not needed
# if [ -n "$UID" ]; then
#     usermod -u $UID datafed
# fi

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../")

install_flag="/tmp/.foxx_is_installed"
if [ ! -f "$install_flag" ]
then
  echo "Installing foxx."
  log_path="$DATAFED_DEFAULT_LOG_PATH"
  if [ ! -d "${log_path}" ]
  then
    su -c "mkdir -p ${log_path}" datafed
  fi
  
  # It should be fine to run this as root because it is an ephemeral container anyway
  cd "${PROJECT_ROOT}"
  # Check to see if foxx has previously been installed
  "${PROJECT_ROOT}/scripts/generate_datafed.sh"

  "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake" -S. -B build						\
    -DBUILD_REPO_SERVER=False		\
    -DBUILD_COMMON=False        \
    -DBUILD_AUTHZ=False					\
    -DBUILD_CORE_SERVER=False		\
    -DBUILD_WEB_SERVER=False		\
    -DBUILD_DOCS=False					\
    -DBUILD_PYTHON_CLIENT=False	\
    -DBUILD_FOXX=True           \
    -DINSTALL_FOXX=True


  "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake" --build build

  # Give arango container a minute to initialize
  # should be replaced with health check at some point
  sleep 5
  "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake" --build build --target install
  
  touch "$install_flag"
  chown "$UID":"$UID" "$install_flag"

else
  echo "/tmp/.foxx_is_installed has been found skipping reinstall"
fi

echo "Sleeping"
sleep 1000

