#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"
source "${SOURCE}/dependency_versions.sh"

# This script will install all of the dependencies needed by DataFed 1.0
sudo apt-get update
sudo apt-get install -y curl gnupg
curl -OL https://download.arangodb.com/arangodb38/DEBIAN/Release.key
sudo apt-key add - < Release.key
echo 'deb https://download.arangodb.com/arangodb38/DEBIAN/ /' | sudo tee /etc/apt/sources.list.d/arangodb.list
sudo apt-get update
sudo dpkg --configure -a
sudo apt-get install -y libtool build-essential g++ gcc npm libboost-all-dev \
pkg-config autoconf automake libtool wget make unzip libcurl4-openssl-dev \
libfuse-dev rapidjson-dev libglobus-common-dev libkrb5-dev python3-pip \
apt-transport-https arangodb3 libzmq3-dev git

install_cmake
# The foxx services need node version 12 or greater so we aren't going to use the package manager
# but instead will install ourselves

# 1. Install nvm which will allow us to update node
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash

export NVM_DIR="$DATAFED_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm

nvm install $DATAFED_NODE_VERSION
nvm use $DATAFED_NODE_VERSION

python3 -m pip install --upgrade pip
python3 -m pip install setuptools sphinx sphinx-rtd-theme sphinx-autoapi

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

npm --prefix ${PROJECT_ROOT}/web install ${PROJECT_ROOT}/web
