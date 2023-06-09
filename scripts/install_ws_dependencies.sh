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

sudo apt-get install -y curl python3 g++ make wget

install_cmake
# The foxx services need node version 12 or greater so we aren't going to use the package manager
# but instead will install ourselves

# 1. Install nvm which will allow us to update node
if [ ! -d "$HOME/.nvm" ]
then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
fi

NODE_VERSION="v14.21.3"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm

nvm install $NODE_VERSION
nvm use $NODE_VERSION

npm --prefix ${PROJECT_ROOT}/web install ${PROJECT_ROOT}/web
