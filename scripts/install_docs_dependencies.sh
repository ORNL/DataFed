#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

# This script will install all of the dependencies needed by DataFed 1.0
sudo apt-get update
sudo dpkg --configure -a
sudo apt-get install -y 

install_cmake
cd ~

install_protobuf
cd ~
python3 -m pip install --upgrade pip
python3 -m pip install setuptools sphinx sphinx-rtd-theme sphinx-autoapi
