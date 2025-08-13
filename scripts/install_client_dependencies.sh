#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

packages=("pkg-config")
pip_packages=("setuptools")
externals=("cmake" "libopenssl" "python" "protobuf")

sudo_command
# This script will install all of the dependencies needed by DataFed 1.0
"$SUDO_CMD" apt-get update
"$SUDO_CMD" dpkg --configure -a
"$SUDO_CMD" apt-get install -y "${packages[@]}"

for ext in "${externals[@]}"; do
  install_dep_by_name "$ext"
done

init_python
source "${DATAFED_PYTHON_ENV}/bin/activate"
"python${DATAFED_PYTHON_VERSION}" -m pip install "${pip_packages[@]}"
"python${DATAFED_PYTHON_VERSION}" -m pip install -r "${PROJECT_ROOT}/python/datafed_pkg/requirements.txt"

cd ~
