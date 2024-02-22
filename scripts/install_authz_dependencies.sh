#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

packages=("libtool" "build-essential" "g++" "gcc" "libboost-all-dev" "autoconf" "automake" "make" "git" "python3-pkg-resources" "python3-pip" "pkg-config" "libglobus-common-dev" "wget" "libssl-dev" "libzmq3-dev")
externals=("cmake" "protobuf" "libsodium" "libzmq")

local_UNIFY=false

if [ $# -eq 1 ]; then
  case "$1" in
    -h|--help)
      # If -h or --help is provided, print help
      echo "Usage: $0 [-h|--help] [unify]"
      ;;
    unify)
      # If 'unify' is provided, print the packages
      # The extra space is necessary to not conflict with the other install scripts
      echo -n "${packages[@]} " >> "$apt_file_path"
      echo -n "${externals[@]} " >> "$ext_file_path"
      local_UNIFY=true
      ;;
    *)
      echo "Invalid Argument"
      ;;
  esac
fi

sudo_command

"$SUDO_CMD" apt-get update
"$SUDO_CMD" dpkg --configure -a
"$SUDO_CMD" apt-get install -y "${packages[@]}"

cd ~
install_cmake

python3 -m pip install --upgrade pip
python3 -m pip install setuptools

if [[ $local_UNIFY = false ]]; then
  for ext in "${externals[@]}"; do
    install_dep_by_name "$ext"
  done
fi
