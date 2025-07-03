#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

sudo_command

# This script will install all of the dependencies needed by DataFed 1.0
"$SUDO_CMD" apt-get update
"$SUDO_CMD" dpkg --configure -a
"$SUDO_CMD" apt-get install -y libtool build-essential g++ gcc make libboost-all-dev \
pkg-config autoconf automake unzip libcurl4-openssl-dev wget \
rapidjson-dev libkrb5-dev git libssl-dev

cd ~
install_python
install_cmake
cd ~

# Install cmake 3.17

init_python
source "${DATAFED_PYTHON_ENV}/bin/activate"
"python${DATAFED_PYTHON_VERSION}" -m pip install --upgrade pip
"python${DATAFED_PYTHON_VERSION}" -m pip install setuptools

install_protobuf
cd ~


