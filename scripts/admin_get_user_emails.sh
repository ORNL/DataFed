#!/bin/bash
# Description
#
# This script is designed to query the database and get all user emails and
# output them to a file. As well as print them to the terminal.
#
# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
# -u has been removed because we have no guarantees that the env variables are defined
set -f -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

Help() {
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|u|p|o]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATAFED_DATABASE_PASSWORD."
  echo "-o, --output-file                 The path to the output file, if no output file"
  echo "                                  is provided a default file will be created."
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

if [ -z "${DATAFED_OUTPUT_FILE}" ]; then
  local_DATAFED_OUTPUT_FILE=""
else
  local_DATAFED_OUTPUT_FILE=$(printenv DATAFED_OUTPUT_FILE)
fi

VALID_ARGS=$(getopt -o hu:p:o: --long 'help',database-user:,database-password:,output-file: -- "$@")
if [[ $? -ne 0 ]]; then
  exit 1
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -u | --database-user)
    local_DATABASE_USER=$2
    shift 2
    ;;
  -p | --database-password)
    local_DATAFED_DATABASE_PASSWORD=$2
    shift 2
    ;;
  -o | --output-file)
    local_DATAFED_OUTPUT_FILE=$2
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

# Check if the variable is empty
if [ -z "$local_DATAFED_OUTPUT_FILE" ]; then
  # Variable is empty or not defined
  local_DATAFED_OUTPUT_FILE="datafed_user_emails.txt"
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

# We are now going to initialize the DataFed database in Arango, but only if sdms database does
# not exist
output=$(curl -s --dump - --user "$local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD" http://localhost:8529/_api/database/user)
if [[ ! "$output" =~ .*"sdms".* ]]; then
  echo "Something is wrong, the sdms database is missing!"
  exit 1
fi

data=$(curl -s -X POST --header 'accept: application/json' -u "$local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD" http://localhost:8529/_db/sdms/_api/cursor -d "{ \"query\" : \"FOR user1 IN u RETURN user1.email\" }")
emails=$(echo "$data" | jq .result)
emails_cleaned=$(echo "$emails" | sed 's/", "/ /g' | sed 's/\[ "//g' | sed 's/" \]//g')

if [ -f "$local_DATAFED_OUTPUT_FILE" ]; then
  # Remove file if it exists
  rm "$local_DATAFED_OUTPUT_FILE"
fi

for email in ${emails_cleaned}; do
  echo "$email"
  echo "$email" >>"$local_DATAFED_OUTPUT_FILE"
done
