#!/bin/env bash

set -uf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")
source "${PROJECT_ROOT}/config/datafed.sh"

Help() {
  echo "$(basename $0) Will create a form with prefilled information for registering a repo server with DataFed must be run on the same machine as the globus gridftp server"
  echo
  echo "Syntax: $(basename $0) [-h|s]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-s, --generate-repo-form-script   Will generate a script that will fill out part of the form with information that can be sourced."
  echo "-c, --generate-repo-form-cfg      Will generate a config file that will contain the necessary information for the repo form."
  echo "-j, --generate-repo-form-json     Will generate a json file that will contain the necessary information for the repo form."
  echo
  echo "NOTE: Do not run this script with sudo!"
}

if [ -z "$DATAFED_GCS_ROOT_NAME" ]; then
  echo "DATAFED_GCS_ROOT_NAME is not defined in ${PROJECT_ROOT}/config/datafed.sh cannot run $SCRIPT."
  exit 1
fi

if [ -z "$DATAFED_GCS_COLLECTION_ROOT_PATH" ]; then
  echo "DATAFED_GCS_COLLECTION_ROOT_PATH is not defined cannot run $SCRIPT"
  exit 1
fi

if [ -z "$DATAFED_GCS_COLLECTION_BASE_PATH" ]; then
  echo "DATAFED_GCS_COLLECTION_BASE_PATH is not defined cannot run $SCRIPT"
  exit 1
fi

if [ -z "$DATAFED_REPO_ID_AND_DIR" ]; then
  echo "DATAFED_REPO_ID_AND_DIR is not defined cannot run $SCRIPT"
  exit 1
fi

# Check that the repo service has been installed
if [ ! -f "${DATAFED_INSTALL_PATH}/keys/datafed-repo-key.pub" ]; then
  echo "Cannot generate repository form if the repo service has not been installed."
  echo "NOTE: This script should be run from the same machine as the repo service"
  echo "and the globus connect server"
fi

local_GENERATE_REPO_FORM_SCRIPT="FALSE"
local_GENERATE_REPO_FORM_CONFIG="FALSE"
local_GENERATE_REPO_FORM_JSON="FALSE"

VALID_ARGS=$(getopt -o hscj --long 'help',generate-repo-form-script,generate-repo-form-config,generate-repo-form-json -- "$@")
if [[ $? -ne 0 ]]; then
  exit 1
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  echo "$1"
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -s | --generate-repo-form-script)
    echo "Processing generate-repo-form-script flag"
    local_GENERATE_REPO_FORM_SCRIPT="TRUE"
    shift 1
    ;;
  -c | --generate-repo-form-config)
    echo "Processing generate-repo-form-config flag"
    local_GENERATE_REPO_FORM_CONFIG="TRUE"
    shift 1
    ;;
  -j | --generate-repo-form-json)
    echo "Processing generate-repo-form-json flag"
    local_GENERATE_REPO_FORM_JSON="TRUE"
    shift 1
    ;;
  --)
    shift
    break
    ;;
  \?) # incorrect option
    echo "Error: Invalid option"
    exit
    ;;
  esac
done

############################################################
# Functions
function validate_domain() {
  local DOMAIN="$1"

  if host "$DOMAIN" | grep -q "has address"; then
    echo "DEFINED"
  else
    echo "UNDEFINED"
  fi
}

function normalize_path() {
  local path=$1
  local normalized=""

  # Remove redundant slashes and handle '.' and '..'
  IFS='/' read -r -a parts <<<"$path"
  for part in "${parts[@]}"; do
    if [[ "$part" == "" || "$part" == "." ]]; then
      # Skip empty parts (redundant slashes) and current directory references
      continue
    elif [[ "$part" == ".." ]]; then
      # Pop the last part for parent directory references
      normalized="${normalized%/*}"
    else
      # Add the part to the normalized path
      normalized="${normalized}/${part}"
    fi
  done

  # Ensure the normalized path starts with a '/'
  echo "${normalized#/}"
}

remove_leading_slashes() {
  local path=$1
  # Remove all trailing forward slashes
  while [[ "$path" == /* ]]; do
    path="${path#/}"
  done
  echo "$path"
}

function remove_trailing_slashes() {
  local path=$1
  # Remove all trailing forward slashes
  while [[ "$path" == */ ]]; do
    path="${path%/}"
  done
  echo "$path"
}
# The below function is meant to remove a base path
# from an absolute path examples of usage are shown below
#
# # Example usage
# prefix="/home/user/projects"
# absolute_path="/home/user/projects/myproject/file.txt"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /myproject/file.txt"
#
# prefix="/"
# absolute_path="/home/user/projects/myproject/file.txt"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /home/user/projects/myproject/file.txt"
#
# prefix="/"
# absolute_path="/"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /"
#
# prefix=""
# absolute_path="/"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /"
#
# prefix=""
# absolute_path=""
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /"
#
# prefix="/home/user/projects"
# absolute_path="/home/user/projects"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /"
#
# prefix="/home/user/projects"
# absolute_path="/home/user/projects////"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /"
#
# prefix="/home/user/projects"
# absolute_path="/home/user/projects////myproject/file.txt"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /myproject/file.txt"
#
# prefix="/home/././user/projects"
# absolute_path="/home/user/projects////myproject/file.txt"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /myproject/file.txt"
#
# # Should throw
# prefix="/home/user/projects"
# absolute_path="/home/user/../projects/myproject/file.txt"
# error=$(remove_base "$prefix" "$absolute_path")
# echo "Error $error == is not a base path of"
#
# prefix="/home/user/projects"
# absolute_path="/home/user/projects/myproject/.././file.txt"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path $relative_path == /file.txt"
#
# # Example usage
# prefix="/home/user/../../projects"
# absolute_path="/home/user/../../projects/myproject/file.txt"
# relative_path=$(remove_base "$prefix" "$absolute_path")
# echo "Relative path: $relative_path == /myproject/file.txt"
function remove_base() {
  base_path=$1
  absolute_path=$2

  base_len=${#base_path}
  abs_len=${#absolute_path}

  if [ $abs_len -lt $base_len ]; then
    echo "Something is wrong the absolute path is less than the root path"
    echo "absolute path: $absolute_path"
    echo "    root path: $base_path"
    return
  fi
  base_path=$(normalize_path "$base_path")
  absolute_path=$(normalize_path "$absolute_path")

  # Ensure the prefix ends with a slash
  base_path=$(remove_trailing_slashes "$base_path")
  base_path="${base_path}/"
  base_path=$(remove_leading_slashes "$base_path")
  base_path="/${base_path}"
  # Ensure the prefix ends with a slash
  absolute_path=$(remove_trailing_slashes "$absolute_path")
  absolute_path="${absolute_path}/"
  absolute_path=$(remove_leading_slashes "$absolute_path")
  absolute_path="/${absolute_path}"
  # Remove the prefix from the absolute path
  if [[ "${absolute_path}" != "${base_path}"* ]]; then
    echo "$base_path is not a base path of $absolute_path."
    return
  fi

  relative_path="${absolute_path#$base_path}"
  relative_path=$(remove_trailing_slashes "$relative_path")
  relative_path=$(remove_leading_slashes "$relative_path")
  echo "/${relative_path}"
}

##################################################################
# End of functions

public_key=$(cat "${DATAFED_INSTALL_PATH}/keys/datafed-repo-key.pub")

# GATEWAY_NAME="${DATAFED_GCS_ROOT_NAME} Storage Gateway"
GUEST_COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Guest"
MAPPED_COLLECTION_NAME="${DATAFED_GCS_ROOT_NAME} Collection Mapped"
PATH_TO_GUEST_ROOT="${DATAFED_GCS_COLLECTION_ROOT_PATH}"

RELATIVE_PATH=$(remove_base "$DATAFED_GCS_COLLECTION_BASE_PATH" "$PATH_TO_GUEST_ROOT")

uuid_of_collection=$(globus-connect-server collection list | grep "$GUEST_COLLECTION_NAME" | awk '{ print $1 }')

if [ -z "$uuid_of_collection" ]; then
  echo "Unable to generate form, you need to first create a guest collection"
  echo "inside '$MAPPED_COLLECTION_NAME' with name '$GUEST_COLLECTION_NAME'."
  echo "The guest collection must be located at $PATH_TO_GUEST_ROOT"
  exit 1
fi

# Probably should grab this from the config file
local_DATAFED_REPO_EGRESS_PORT="9000"
if [ -z "${DATAFED_REPO_DOMAIN}" ]; then
  repo_domain_name=""
else
  repo_domain_name=$(printenv DATAFED_REPO_DOMAIN)
fi

if [ "${repo_domain_name}" == "" ]; then
  repo_domain_name=$(domainname -A | awk '{print $1}')
fi

local_DEFINED=$(validate_domain "$repo_domain_name")
if [ "${local_DEFINED}" == "UNDEFINED" ] || [ -z "$repo_domain_name" ]; then
  echo "domain name (${repo_domain_name}) is ${local_DEFINED} using local IP."
  local_address=$(hostname -I | awk '{print $1}')
else
  local_address="$repo_domain_name"
fi

# This will remove any extra // at the beginning of the FULL_RELATIVE_PATH
FULL_RELATIVE_PATH="${RELATIVE_PATH}/$DATAFED_REPO_ID_AND_DIR"
FULL_RELATIVE_PATH=$(remove_leading_slashes "$FULL_RELATIVE_PATH")
FULL_RELATIVE_PATH="/${FULL_RELATIVE_PATH}"

if [ "$local_GENERATE_REPO_FORM_SCRIPT" = "TRUE" ]; then
  OUTPUT_SCRIPT_NAME="${DATAFED_REPO_ID_AND_DIR}-repo-form.sh"
  echo "Creating ${OUTPUT_SCRIPT_NAME} file"
  echo "export DATAFED_REPO_ID=\"$DATAFED_REPO_ID_AND_DIR\"" >"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_TITLE=\"$DATAFED_GCS_ROOT_NAME\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_DESCRIPTION=\"Autogenerated\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_SERVER_ADDRESS=\"tcp://$local_address:$local_DATAFED_REPO_EGRESS_PORT\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_PUBLIC_KEY=\"$public_key\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_ENDPOINT_UUID=\"$uuid_of_collection\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_RELATIVE_PATH=\"${FULL_RELATIVE_PATH}\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_DOMAIN=\"placeholder\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_EXPORT_PATH=\"\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "export DATAFED_REPO_CAPACITY=\"\"" >>"${OUTPUT_SCRIPT_NAME}"
fi

if [ "$local_GENERATE_REPO_FORM_CONFIG" = "TRUE" ]; then
  OUTPUT_SCRIPT_NAME="${DATAFED_REPO_ID_AND_DIR}-repo-form.cfg"
  echo "Creating ${OUTPUT_SCRIPT_NAME} file"
  echo "id=\"$DATAFED_REPO_ID_AND_DIR\"" >"${OUTPUT_SCRIPT_NAME}"
  echo "title=\"$DATAFED_GCS_ROOT_NAME\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "desc=\"Autogenerated\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "address=\"tcp://$local_address:$local_DATAFED_REPO_EGRESS_PORT\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "pub_key=\"$public_key\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "endpoint=\"$uuid_of_collection\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "path=\"${FULL_RELATIVE_PATH}\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "domain=\"placeholder\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "exp_path=\"\"" >>"${OUTPUT_SCRIPT_NAME}"
  echo "capacity=\"\"" >>"${OUTPUT_SCRIPT_NAME}"
fi

if [ "$local_GENERATE_REPO_FORM_JSON" = "TRUE" ]; then
  # JSON treats backslash as a special character it will need to be represented as \\ when printed in JSON
  OUTPUT_SCRIPT_NAME="${DATAFED_REPO_ID_AND_DIR}-repo-form.json"
  echo "Creating ${OUTPUT_SCRIPT_NAME} script"
  echo "{" >${OUTPUT_SCRIPT_NAME}
  echo "  \"id\": \"$DATAFED_REPO_ID_AND_DIR\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"title\": \"$DATAFED_GCS_ROOT_NAME\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"desc\": \"Autogenerated\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"address\": \"tcp://$local_address:$local_DATAFED_REPO_EGRESS_PORT\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"pub_key\": \"$public_key\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"endpoint\": \"$uuid_of_collection\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"path\": \"${FULL_RELATIVE_PATH}\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"domain\": \"placeholder\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"exp_path\": \"\"," >>"${OUTPUT_SCRIPT_NAME}"
  echo "  \"capacity\": 0" >>"${OUTPUT_SCRIPT_NAME}"
  echo "}" >>"${OUTPUT_SCRIPT_NAME}"
fi

echo "DataFed Repo Form Registration Contents"
echo "ID: $DATAFED_REPO_ID_AND_DIR"
echo "Title: $DATAFED_GCS_ROOT_NAME"
echo "Description: Autogenerated"
# Should be something like this: tcp://datafed-gcs-test.ornl.gov:9000
# This is the domain name of the repository server
echo "Srvr. Address: tcp://$local_address:$local_DATAFED_REPO_EGRESS_PORT"
echo "Public Key: $public_key"
echo "End-point ID: $uuid_of_collection"
echo "Path: ${FULL_RELATIVE_PATH}"
echo "Domain: placeholder"
# I don't know what this is
echo "Export Path: "
echo "Capacity: The capacity of the repository"
