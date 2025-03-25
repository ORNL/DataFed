#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

source "${PROJECT_ROOT}/scripts/utils.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"
source "${SOURCE}/dependency_versions.sh"

Help()
{
  echo $(basename "$0")" Will install all datafed dependencies"
  echo
  echo "Syntax: "$(basename "$0")" [-h|a|w|c|r]"
  echo "options:"
  echo "-h, --help                         Print this help message"
  echo "-a, --disable-arango-deps-install  Don't install arango"
  echo "-w, --disable-web-deps-install     Don't install web deps"
  echo "-c, --disable-core-deps-install    Don't install core deps"
  echo "-r, --disable-repo-deps-install    Don't install repo deps"
  echo "-z, --disable-authz-deps-install   Don't install authz deps"
}

local_INSTALL_ARANGO="TRUE"
local_INSTALL_WEB="TRUE"
local_INSTALL_CORE="TRUE"
local_INSTALL_REPO="TRUE"
local_INSTALL_AUTHZ="TRUE"

VALID_ARGS=$(getopt -o hawcrz --long 'help',disable-arango-deps-install,disable-web-deps-install,disable-core-deps-install,disable-repo-debs-install,disable-authz-deps-install -- "$@")
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
    -a | --disable-arango-deps-install)
        local_INSTALL_ARANGO="FALSE"
        shift
        ;;
    -w | --disable-web-deps-install)
        local_INSTALL_WEB="FALSE"
        shift
        ;;
    -c | --disable-core-deps-install)
        local_INSTALL_CORE="FALSE"
        shift
        ;;
    -r | --disable-repo-deps-install)
        local_INSTALL_REPO="FALSE"
        shift
        ;;
    -z | --disable-authz-deps-install)
        local_INSTALL_AUTHZ="FALSE"
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

touch "$apt_file_path"
touch "$ext_file_path"
touch "$pip_file_path"

# Defines SUDO_CMD which is empty if root
# sudo path if exists
# throws error otherwise

"$SUDO_CMD" apt-get update
"$SUDO_CMD" apt install -y wget git curl

# This script will install all of the dependencies needed by DataFed 1.0
"$SUDO_CMD" dpkg --configure -a

if [ "$local_INSTALL_CORE" == "TRUE" ]
then
  "$SUDO_CMD" "$SOURCE/install_core_dependencies.sh" unify
fi
if [ "$local_INSTALL_REPO" == "TRUE" ]
then
  "$SUDO_CMD" "$SOURCE/install_repo_dependencies.sh" unify
fi
if [ "$local_INSTALL_WEB" == "TRUE" ]
then
  "$SUDO_CMD" "$SOURCE/install_ws_dependencies.sh" unify
fi
if [ "$local_INSTALL_AUTHZ" == "TRUE" ]
then
  "$SUDO_CMD" "$SOURCE/install_authz_dependencies.sh" unify
fi
"$SUDO_CMD" "$SOURCE/install_docs_dependencies.sh" unify

all_packages=$(cat "$apt_file_path")
IFS=' ' read -r -a all_packages_array <<< "$all_packages"
deduplicated_packages_array=($(printf "%s\n" "${all_packages_array[@]}" | sort -u))
echo "DEPENDENCIES (${deduplicated_packages_array[@]})"
"$SUDO_CMD" apt-get install -y "${deduplicated_packages_array[@]}"

all_pip_packages=$(cat "$pip_file_path")
IFS=' ' read -ra all_pip_packages_array <<< "$all_pip_packages"
if [ ${#all_pip_packages_array[@]} -gt 0 ]; then
  echo "DEPENDENCIES (${all_pip_packages_array[@]})"
  init_python
  source "${DATAFED_PYTHON_ENV}/bin/activate"
  python3 -m pip install "${all_pip_packages_array[@]}"
fi

all_externals=$(cat "$ext_file_path")
IFS=' ' read -r -a all_externals_array <<< "$all_externals"
# Deduplication must preserve order
deduplicated_externals_array=($(echo "${all_externals_array[@]}" | awk '{ for (i=1;i<=NF;i++) if (!seen[$i]++) printf("%s ", $i) }'))
echo "DEPENDENCIES (${deduplicated_externals_array[@]})"
for ext in "${deduplicated_externals_array[@]}"; do
  echo "===== INSTALLING $ext ======"
  install_dep_by_name "$ext"
done

rm "$apt_file_path"
rm "$ext_file_path"
rm "$pip_file_path"

if [ "$local_INSTALL_ARANGO" == "TRUE" ]
then
  echo "I AM RUNNING"
  install_arangodb
fi
