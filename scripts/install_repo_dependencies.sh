#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

packages=("libtool" "wget" "build-essential" "g++" "gcc" "libboost-all-dev" "pkg-config" "autoconf" "automake" "make" "unzip" "git")
pip_packages=("setuptools")
externals=("cmake" "libopenssl" "python" "protobuf" "libsodium" "libzmq")

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
      echo -n "${pip_packages[@]} " >> "$pip_file_path"
      local_UNIFY=true
      ;;
    *)
      # If any other argument is provided, install the packages
      echo "Invalid Argument"
      ;;
  esac
fi

sudo_command

if [[ $local_UNIFY = false ]]; then
  "$SUDO_CMD" apt-get update
  "$SUDO_CMD" dpkg --configure -a
  "$SUDO_CMD" apt-get install -y "${packages[@]}"

  for ext in "${externals[@]}"; do
    install_dep_by_name "$ext"
  done

  init_python
  source "${DATAFED_PYTHON_ENV}/bin/activate"
  "python${DATAFED_PYTHON_VERSION}" -m pip install --upgrade pip
  "python${DATAFED_PYTHON_VERSION}" -m pip install "${pip_packages[@]}"
fi
