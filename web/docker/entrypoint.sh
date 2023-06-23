#!/bin/bash

# NVM_DIR must be defined

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../..)

source $NVM_DIR/nvm.sh
${PROJECT_ROOT}/scripts/generate_datafed.sh
${PROJECT_ROOT}/scripts/generate_ws_config.sh
${PROJECT_ROOT}/scripts/install_ws.sh

exec "$@"
