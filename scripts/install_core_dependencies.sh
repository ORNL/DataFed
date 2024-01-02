#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

packages=("libtool" "build-essential" "g++" "gcc" "make" "libboost-all-dev" "pkg-config" "autoconf" "automake" "unzip" "libcurl4-openssl-dev" "wget" "rapidjson-dev" "libkrb5-dev" "git" "python3-pkg-resources" "python3-pip" "libssl-dev" "libzmq3-dev")
externals=("cmake" "nlohmann_json" "json_schema_validator" "protobuf" "libsodium" "libzmq")

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

if [[ $local_UNIFY = false ]]; then
  sudo apt-get update
  sudo dpkg --configure -a
  sudo apt-get install -y "${packages[@]}"
  python3 -m pip install --upgrade pip
  python3 -m pip install setuptools

  for ext in "${externals[@]}"; do
    install_dep_by_name "$ext"
  done
fi
