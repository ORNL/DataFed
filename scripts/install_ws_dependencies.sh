#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

Help()
{
  echo "$(basename $0) install web dependencies."
  echo
  echo "Syntax: $(basename $0) [-h|n]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-n, --node_install_dir            Install directory, defaults to $HOME"
}

local_NODE_INSTALL="$HOME"

VALID_ARGS=$(getopt -o hn: --long 'help',node_install_dir: -- "$@")
if [[ $? -ne 0 ]]; then
      exit 1;
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
    -h | --help)
        Help
        exit 0
        ;;
    -n | --node_install_dir)
        echo "Processing 'node install dir' option. Input argument is '$2'"
        local_NODE_INSTALL=$2
        shift 2
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

# This script will install all of the dependencies needed by DataFed 1.0
sudo apt-get update
sudo dpkg --configure -a

sudo apt-get install -y curl python3 g++ make wget

install_cmake
# The foxx services need node version 12 or greater so we aren't going to use the package manager
# but instead will install ourselves

# 1. Install nvm which will allow us to update node
if [ ! -d "$local_NODE_INSTALL/.nvm" ]
then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
fi

NODE_VERSION="v14.21.3"
export NVM_DIR="$local_NODE_INSTALL/.nvm"
[ -s "$local_NODE_INSTALL/nvm.sh" ] && . "$local_NODE_INSTALL/nvm.sh" # This loads nvm

nvm install $NODE_VERSION
nvm use $NODE_VERSION

npm --prefix ${PROJECT_ROOT}/web install ${PROJECT_ROOT}/web
