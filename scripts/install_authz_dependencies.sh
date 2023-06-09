#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/dependency_install_functions.sh"

# This script will install all of the dependencies needed by DataFed 1.0
sudo apt-get update
sudo dpkg --configure -a
sudo apt-get install -y libtool build-essential g++ gcc cmake libboost-all-dev \
autoconf automake make git python3-pkg-resources python3-pip pkg-config \
libglobus-common-dev wget libssl-dev
sudo apt-get install -y libzmq3-dev 

install_cmake
cd ~

python3 -m pip install --upgrade pip
python3 -m pip install setuptools

install_protobuf
cd ~

install_libsodium
cd ~

install_libzmq
cd ~

