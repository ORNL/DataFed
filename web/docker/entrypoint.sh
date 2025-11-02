#!/bin/bash
# NVM_DIR must be defined

set -euf -o pipefail

if [ -n "$UID" ]; then
  usermod -u "$UID" datafed
fi

chown -R datafed:root "${DATAFED_INSTALL_PATH}/web"
chown -R datafed:root "${BUILD_DIR}"

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../..")

"${PROJECT_ROOT}/scripts/generate_datafed.sh"
"${PROJECT_ROOT}/scripts/generate_ws_config.sh"
. "${PROJECT_ROOT}/scripts/dependency_versions.sh"

export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
export NODE_VERSION="$DATAFED_NODE_VERSION"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm

echo "NODE VERSION $NODE_VERSION"
echo "Which node"
NODE_PATH=$(su datafed -c ". ${NVM_DIR}/nvm.sh; nvm which node")
# Do this as root
if [ ! -L "/usr/local/bin/node" ]; then
  ln -s "$NODE_PATH" /usr/local/bin/node
fi
# Send output to file as well as print to terminal
log_path=$(grep "log-path" "${BUILD_DIR}/config/datafed-ws.cfg" | cut -d "=" -f 2 | tr -d ' ')

if [ ! -d "${log_path}" ]; then
  su -c "mkdir -p ${log_path}" datafed
fi

if [ ! -f "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub" ]; then
  echo "datafed-core-key.pub not found"
  exit 1
fi
cp "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub" "${BUILD_DIR}/web/static"

if [ "$#" -eq 0 ]; then
  echo "No arguments were passed, running bash"
  exec "bash"
  exit 0
fi

cd "$DATAFED_INSTALL_PATH/web"
datafed_ws_exec=$(basename "$1")
if [ "${datafed_ws_exec}" = "datafed-ws.js" ]; then
  # Send output to log file
  su datafed -c '"$@"' -- argv0 "$@" 2>&1 | su datafed -c "tee $log_path/datafed-ws.log"
else
  echo "Not sending output to datafed-ws.log"
  # If not do not by default send to log file
  su datafed -c '"$@"' -- argv0 "$@"
fi
