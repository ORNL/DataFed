#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"
source "${SOURCE}/dependency_versions.sh"

apt_file_path="/tmp/apt_deps"
ext_file_path="/tmp/ext_deps"
touch "$apt_file_path"
touch "$ext_file_path"

sudo apt-get update
sudo apt install -y wget git curl

install_cmake
# This script will install all of the dependencies needed by DataFed 1.0
sudo dpkg --configure -a

sudo "$SOURCE/install_core_dependencies.sh" unify
sudo "$SOURCE/install_repo_dependencies.sh" unify
sudo "$SOURCE/install_ws_dependencies.sh" --unify
sudo "$SOURCE/install_authz_dependencies.sh" unify

all_packages=$(cat $apt_file_path)
IFS=' ' read -r -a all_packages_array <<< "$all_packages"
deduplicated_packages_array=($(printf "%s\n" "${all_packages_array[@]}" | sort -u))

all_externals=$(cat $ext_file_path)
IFS=' ' read -r -a all_externals_array <<< "$all_externals"

sudo apt-get install -y "${deduplicated_packages_array[@]}"

echo "DEPENDENCIES (${deduplicated_externals_array[@]})"

cd ~

for ext in "${all_externals_array[@]}"; do
  echo "===== INSTALLING $ext ======"
  install_dep_by_name "$ext"
done

rm $apt_file_path
rm $ext_file_path

# The foxx services need node version 12 or greater so we aren't going to use the package manager
# but instead will install ourselves

python3 -m pip install --upgrade pip
python3 -m pip install setuptools sphinx sphinx-rtd-theme sphinx-autoapi

curl -OL https://download.arangodb.com/arangodb38/DEBIAN/Release.key
sudo apt-key add - < Release.key
echo 'deb https://download.arangodb.com/arangodb38/DEBIAN/ /' | sudo tee /etc/apt/sources.list.d/arangodb.list
sudo apt-get install apt-transport-https
sudo apt-get update
sudo apt-get install arangodb3
