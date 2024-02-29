#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"
source "${SOURCE}/dependency_versions.sh"

sudo_command

touch "$apt_file_path"
touch "$ext_file_path"

# Defines SUDO_CMD which is empty if root
# sudo path if exists
# throws error otherwise

"$SUDO_CMD" apt-get update
"$SUDO_CMD" apt install -y wget git curl

install_cmake
# This script will install all of the dependencies needed by DataFed 1.0
"$SUDO_CMD" dpkg --configure -a

"$SUDO_CMD" "$SOURCE/install_core_dependencies.sh" unify
"$SUDO_CMD" "$SOURCE/install_repo_dependencies.sh" unify
"$SUDO_CMD" "$SOURCE/install_ws_dependencies.sh" unify
"$SUDO_CMD" "$SOURCE/install_authz_dependencies.sh" unify

all_packages=$(cat $apt_file_path)
IFS=' ' read -r -a all_packages_array <<< "$all_packages"
deduplicated_packages_array=($(printf "%s\n" "${all_packages_array[@]}" | sort -u))

all_externals=$(cat $ext_file_path)
IFS=' ' read -r -a all_externals_array <<< "$all_externals"

"$SUDO_CMD" apt-get install -y "${deduplicated_packages_array[@]}"

echo "DEPENDENCIES (${deduplicated_externals_array[@]})"

cd ~

for ext in "${all_externals_array[@]}"; do
  echo "===== INSTALLING $ext ======"
  install_dep_by_name "$ext"
done

rm $apt_file_path
rm $ext_file_path

python3 -m pip install --upgrade pip
python3 -m pip install setuptools sphinx sphinx-rtd-theme sphinx-autoapi

install_arangodb
