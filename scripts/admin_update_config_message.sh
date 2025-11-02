#!/bin/bash
# Description
#
# The script is designed to be able to take a default message file if specified and insert
# it so that it displays on the home web server page

# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
# -u has been removed because we have no guarantees that the env variables are defined
set -f -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

Help() {
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|u|p|m]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATAFED_DATABASE_PASSWORD."
  echo "-m, --message-file                The path to the message file to display, if no message file"
  echo "                                  is provided a default message file will be created."
  echo
  echo "NOTE: Do not run this script with sudo!"
}

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"

if [ -z "${DATAFED_DATABASE_PASSWORD}" ]; then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

if [ -z "${DATAFED_MESSAGE_FILE}" ]; then
  local_DATAFED_MESSAGE_FILE=""
else
  local_DATAFED_MESSAGE_FILE=$(printenv DATAFED_MESSAGE_FILE)
fi

VALID_ARGS=$(getopt -o hu:p:m: --long 'help',database-user:,database-password:,message-file: -- "$@")
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
  -m | --message-file)
    echo "Processing 'DataFed Message File' option. Input argument is '$2'"
    local_DATAFED_MESSAGE_FILE=$2
    shift 2
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

local_DATAFED_MESSAGE="DataFed servers will be off-line for regular maintenance every Sunday night from 11:45 pm until 12:15 am EST Monday morning."
# Check if the variable is empty
if [ -z "$local_DATAFED_MESSAGE_FILE" ]; then
  # Variable is empty or not defined
  local_DATAFED_DEFAULT_MESSAGE_FILE="${PROJECT_ROOT}/config/datafed_display_message.txt"
  echo "WARNING DATAFED_MESSAGE_FILE is not defined. Will look for file in $local_DATAFED_DEFAULT_MESSAGE_FILE."

  if [ -f "$local_DATAFED_DEFAULT_MESSAGE_FILE" ]; then
    local_DATAFED_MESSAGE=$(cat "$local_DATAFED_DEFAULT_MESSAGE_FILE")
  else
    echo "$local_DATAFED_MESSAGE" >$local_DATAFED_DEFAULT_MESSAGE_FILE
  fi

else
  local_DATAFED_MESSAGE=$(cat "$local_DATAFED_MESSAGE_FILE")
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

# We are now going to initialize the DataFed database in Arango, but only if sdms database does
# not exist
output=$(curl --dump - --user $local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD http://localhost:8529/_api/database/user)

if [[ "$output" =~ .*"sdms".* ]]; then
  echo "Verified SDMS exists."
else
  echo "Something is wrong, the sdms database is missing!"
  exit 1
fi

arangosh --server.password ${local_DATAFED_DATABASE_PASSWORD} --server.username ${local_DATABASE_USER} --javascript.execute-string "db._useDatabase(\"sdms\"); db.config.insert({\"_key\": \"msg_daily\", \"msg\" : \"$local_DATAFED_MESSAGE\"}, {overwrite: true});"
