#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

source "${PROJECT_ROOT}/scripts/utils.sh"
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
  echo "-n, --node_install_dir            Install directory, defaults to"
  echo "                                  whatever is defined in the datafed.sh file"
  echo "                                  DATAFED_DEPENDENCIES_INSTALL_PATH"
  echo "                                  ${DATAFED_DEPENDENCIES_INSTALL_PATH}"
  echo "-u, --unify                       Unifies install scripts to be used in docker builds"
}

# Equivalent to the .nvm directory
local_NODE_INSTALL="$DATAFED_DEPENDENCIES_INSTALL_PATH"
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

sudo_command

if [[ $local_UNIFY = false ]]; then
  "$SUDO_CMD" apt-get update
  "$SUDO_CMD" dpkg --configure -a
  "$SUDO_CMD" apt-get install -y "${packages[@]}"

  for ext in "${externals[@]}"; do
    install_dep_by_name "$ext"
  done
fi

# The foxx services need node version 12 or greater so we aren't going to use the package manager
# but instead will install ourselves

# 1. Install nvm which will allow us to update node
install_nvm
install_node

export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
export NODE_VERSION="$DATAFED_NODE_VERSION"
"$NVM_DIR/nvm-exec" npm --prefix "${PROJECT_ROOT}/web" install "${PROJECT_ROOT}/web"
