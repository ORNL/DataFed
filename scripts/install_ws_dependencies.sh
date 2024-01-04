#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${SOURCE}/dependency_versions.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

packages=("curl" "python3" "g++" "make" "wget")
externals=("cmake")

Help()
{
  echo "$(basename $0) install web dependencies."
  echo
  echo "Syntax: $(basename $0) [-h|n]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-n, --node_install_dir            Install directory, defaults to $HOME"
  echo "-u, --unify                       Unifies install scripts to be used in docker builds"
}

local_NODE_INSTALL="$HOME"
local_UNIFY=false

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
        local_NODE_INSTALL=$2
        shift 2
        ;;
    unify)
        # The extra space is necessary to not conflict with the other install scripts
        echo -n "${packages[@]} " >> "$apt_file_path"
        echo -n "${externals[@]} " >> "$ext_file_path"
        local_UNIFY=true
        shift
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

if [[ $local_UNIFY = false ]]; then
  sudo apt-get update
  sudo dpkg --configure -a
  sudo apt-get install -y "${packages[@]}"

  for ext in "${externals[@]}"; do
    install_dep_by_name "$ext"
  done
fi

# The foxx services need node version 12 or greater so we aren't going to use the package manager
# but instead will install ourselves

# 1. Install nvm which will allow us to update node
if [[ -z "$NVM_DIR" ]];
then
  export NVM_DIR="$local_NODE_INSTALL/.nvm"
fi

if [ ! -d "$NVM_DIR" ]
then
  echo "==========INSTALLING NVM============"
  mkdir -p "$NVM_DIR"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
fi

[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm

nvm install $DATAFED_NODE_VERSION
nvm use $DATAFED_NODE_VERSION

npm --prefix ${PROJECT_ROOT}/web install ${PROJECT_ROOT}/web
