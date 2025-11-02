#!/bin/bash
# Description
#
# The script is designed to help make users admins or disable admin accounts.
# if an admin email address is provided in the datafed.sh it will attempt
# to also send a notification anytime admin permissions are changed.

# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
# -u has been removed because we have no guarantees that the env variables are defined
set -f -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"
SCRIPT_NAME=$(basename "$0")

Help() {
  echo "${SCRIPT_NAME} will make the specified DataFed user a DataFed admin when enable-admin-account flag is used."
  echo
  echo "Syntax: ${SCRIPT_NAME} [-h|u|p|d|e]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATAFED_DATABASE_PASSWORD."
  echo "-d, --datafed-user                DataFed user that is being updated."
  echo "                                  Should have the following form."
  echo "                                  'u/gilligan'"
  echo "-e, --enable-admin-account        Enable admin account off by default."
  echo
  echo "NOTE: Do not run this script with sudo!"
}

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"
local_DATAFED_USER=""
local_ENABLE_ADMIN_ACCOUNT="FALSE"

if [ -z "${DATAFED_DATABASE_PASSWORD}" ]; then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

VALID_ARGS=$(getopt -o hu:p:d:e --long 'help',database-user:,database-password:,datafed-user:,enable-admin-account -- "$@")
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
  -u | --database-user)
    echo "Processing 'Database user' option. Input argument is '$2'"
    local_DATABASE_USER=$2
    shift 2
    ;;
  -p | --database-password)
    echo "Processing 'Database password' option. Input argument is '$2'"
    local_DATAFED_DATABASE_PASSWORD=$2
    shift 2
    ;;
  -d | --datafed-user)
    echo "Processing 'DataFed user' option. Input argument is '$2'"
    local_DATAFED_USER=$2
    shift 2
    ;;
  -e | --enable-admin-account)
    echo "Processing 'enable admin account' option. Input argument is '$2'"
    local_ENABLE_ADMIN_ACCOUNT="TRUE"
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

ERROR_DETECTED=0
if [ -z "$local_DATAFED_DATABASE_PASSWORD" ]; then
  echo "Error DATAFED_DATABASE_PASSWORD is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -p, --database-password"
  echo "      or with the environment variable DATAFED_DATABASE_PASSWORD."
  ERROR_DETECTED=1
fi

# Check if the variable is empty
if [ -z "$local_DATAFED_USER" ]; then
  # Variable is empty or not defined
  echo "Error A user id has not been specified unable to update user."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

# We are now going to make sure the database actually exists.
output=$(curl --dump - \
  --user "$local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD" \
  http://localhost:8529/_api/database/user)

if [[ "$output" =~ .*"$local_DATABASE_NAME".* ]]; then
  echo "Verified SDMS exists."
else
  echo "Something is wrong, the $local_DATABASE_NAME database is missing!"
  exit 1
fi

# Start by checking if the user exists, cannot run if the user does not exist.
# Grab the key
# USER_KEY - need to grab this from the database

if [[ "$local_ENABLE_ADMIN_ACCOUNT" == "TRUE" ]]; then
  arangosh --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute-string "db._useDatabase(\"$local_DATABASE_NAME\");  db.u.update( $USER_KEY, {\"is_admin\": \"true\"});"

else
  arangosh --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute-string "db._useDatabase(\"$local_DATABASE_NAME\");
  db.u.update( $USER_KEY, {\"is_admin\": \"false\"});"

fi
