#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${SOURCE}/dependency_versions.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

# Equivalent to the .nvm directory
local_NODE_INSTALL="$DATAFED_DEPENDENCIES_INSTALL_PATH"

sudo_command

install_node
