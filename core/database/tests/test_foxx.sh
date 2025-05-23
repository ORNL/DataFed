#!/bin/bash

# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
# -u has been removed because we are checking for possible non existent env variables
set -f -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../../../)
source ${PROJECT_ROOT}/config/datafed.sh

Help()
{
  echo "$(basename $0) Will run a Foxx unit test"
  echo
  echo "Syntax: $(basename $0) [-h|u|p|t]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-f, --foxx-api-major-version      The major version number to mount the foxx api under."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATAFED_DATABASE_PASSWORD."
  echo "-t, --test                        The name of the test to run. If nothing is specified"
  echo "                                  will run all the tests."
  echo
  echo "NOTE: Do not run this script with sudo!"
}

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"

if [ -z "${DATAFED_DATABASE_PASSWORD}" ]
then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

if [ -z "${FOXX_MAJOR_API_VERSION}" ]
then
  local_FOXX_MAJOR_API_VERSION=$(cat ${PROJECT_ROOT}/cmake/Version.cmake | grep -o -P "(?<=FOXX_API_MAJOR).*(?=\))" | xargs )
else
  local_FOXX_MAJOR_API_VERSION=$(printenv FOXX_MAJOR_API_VERSION)
fi

TEST_TO_RUN="all"

VALID_ARGS=$(getopt -o hu:p:f:t: --long 'help',database-user:,database-password:,foxx-api-major-version:,test: -- "$@")
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
    -f | --foxx-api-major-version)
        echo "Processing 'Foxx major api version' option. Input argument is '$2'"
        local_FOXX_MAJOR_API_VERSION=$2
        shift 2
        ;;
    -t | --test)
        echo "Processing 'test' option. Input argument is '$2'"
        TEST_TO_RUN=$2
        shift 2
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

ERROR_DETECTED=0
if [ -z "$local_DATAFED_DATABASE_PASSWORD" ]
then
  echo "Error DATAFED_DATABASE_PASSWORD is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -p, --database-password"
  echo "      or with the environment variable DATAFED_DATABASE_PASSWORD."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]
then
  exit 1
fi

# There are apparently 3 different ways to deploy Foxx microservices,
# Using curl with http requests
# Using the Arango web ui 
# Using node module
#
# The web deployment requires manual interaction, and I could not figure out the 
# syntax for the REST http endpoints with curl so we are going to try the node module

## Will create the zip file in the build directory to keep datafed source code clean
#cd ../../build
## Zip up the api
#zip datafed.zip ../core/database/api/* 
#
## Get the size of the file in bytes
#bytes=$(wc -c < datafed.zip)

NODE_VERSION="v14.21.3"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm

nvm use $NODE_VERSION

FOXX_PREFIX=""
{
	# Determine if exists globally first
	which foxx
} || {
	FOXX_PREFIX="~/bin/"
}

PATH_TO_PASSWD_FILE=${SOURCE}/database_temp.password
if [ "$TEST_TO_RUN" == "all" ]
then
  "${FOXX_PREFIX}foxx" test -u "${local_DATABASE_USER}" \
    -p "${PATH_TO_PASSWD_FILE}" \
    --database "${local_DATABASE_NAME}" \
    "/api/${local_FOXX_MAJOR_API_VERSION}" --reporter spec
else
  "${FOXX_PREFIX}foxx" test -u "${local_DATABASE_USER}" \
    -p "${PATH_TO_PASSWD_FILE}" \
    --database "${local_DATABASE_NAME}" \
    "/api/${local_FOXX_MAJOR_API_VERSION}" "$TEST_TO_RUN" --reporter spec
fi
