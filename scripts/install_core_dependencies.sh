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
sudo apt-get install -y libtool build-essential g++ gcc make libboost-all-dev \
pkg-config autoconf automake unzip libcurl4-openssl-dev wget \
rapidjson-dev libkrb5-dev git python3-pkg-resources python3-pip libssl-dev
sudo apt-get install -y libzmq3-dev 

install_cmake
cd ~

# Install cmake 3.17

python3 -m pip install --upgrade pip
python3 -m pip install setuptools

install_nlohmann_json
cd ~

install_json_schema_validator
cd ~

install_protobuf
cd ~

install_libsodium
cd ~

install_libzmq
cd ~

