#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

packages=("g++" "gcc" "make" "python3-pkg-resources" "python3-pip" "pkg-config" "python3-venv")
externals=("cmake" "protobuf")
pip_packages=("setuptools" "sphinx" "sphinx-rtd-theme" "sphinx-autoapi")

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
      echo -n "${pip_packages[@]} " >> "$pip_file_path"
      echo -n "${externals[@]} " >> "$ext_file_path"
      local_UNIFY=true
      ;;
    *)
      echo "Invalid Argument"
      ;;
  esac
fi


if [[ $local_UNIFY = false ]]; then
  sudo_command
  "$SUDO_CMD" apt-get update
  "$SUDO_CMD" dpkg --configure -a
  "$SUDO_CMD" apt-get install -y "${packages[@]}"
  init_python
  source "${DATAFED_PYTHON_ENV}/bin/activate"
  python3 -m pip install --upgrade pip
  python3 -m pip install "${pip_packages[@]}"

  for ext in "${externals[@]}"; do
    install_dep_by_name "$ext"
  done
fi

