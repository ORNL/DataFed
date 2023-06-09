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
sudo apt-get install -y libtool build-essential g++ gcc libboost-all-dev \
  pkg-config autoconf automake make unzip git python3-pkg-resources \
  libssl-dev
sudo apt-get install -y libzmq3-dev  python3-pip

python3 -m pip install --upgrade pip
python3 -m pip install setuptools

install_cmake
cd ~

install_protobuf
cd ~

install_libsodium
cd ~

install_libzmq
cd ~

