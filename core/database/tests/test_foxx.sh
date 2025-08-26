#!/bin/bash

# History
#
# -e added back in because CI jobs are not failing when there are problems in
# this script. Residual password files can be removed a different way. i.e.  in
# a cleanup script associated with a CI job.
#
# -e has been removed so that if an error occurs the PASSWORD File is deleted
# and not left lying around
set -euf -o pipefail

SCRIPT=$(realpath "$BASH_SOURCE[0]")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../../../)
source ${PROJECT_ROOT}/config/datafed.sh
source "${PROJECT_ROOT}/scripts/dependency_versions.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

Help() {
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

if [ -z "${DATAFED_DATABASE_PASSWORD:-}" ]; then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

if [ -z "${FOXX_MAJOR_API_VERSION:-}" ]; then
  local_FOXX_MAJOR_API_VERSION=$(cat ${PROJECT_ROOT}/cmake/Version.cmake | grep -o -P "(?<=FOXX_API_MAJOR).*(?=\))" | xargs)
else
  local_FOXX_MAJOR_API_VERSION=$(printenv FOXX_MAJOR_API_VERSION)
fi

TEST_TO_RUN="all"

VALID_ARGS=$(getopt -o hu:p:f:t: --long 'help',database-user:,database-password:,foxx-api-major-version:,test: -- "$@")
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

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

# There are apparently 3 different ways to deploy Foxx microservices,
# Using curl with http requests
# Using the Arango web ui
# Using node module
#
# The web deployment requires manual interaction, and I could not figure out the
# syntax for the REST http endpoints with curl so we are going to try the node module

# Will only install if not already present
install_nvm
install_node

FOXX_PREFIX=""
if ! command -v foxx >/dev/null 2>&1; then
  FOXX_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm/bin/"
fi

PATH_TO_PASSWD_FILE=${SOURCE}/database_temp.password
if [ "$TEST_TO_RUN" == "all" ]; then
  # WARNING Foxx and arangosh arguments differ --server is used for Foxx not --server.endpoint
  "${FOXX_PREFIX}foxx" test -u "${local_DATABASE_USER}" \
    --server "tcp://${DATAFED_DATABASE_HOST}:8529" \
    -p "${PATH_TO_PASSWD_FILE}" \
    --database "${local_DATABASE_NAME}" \
    "/api/${local_FOXX_MAJOR_API_VERSION}" --reporter spec
else
  echo "Test: $TEST_TO_RUN"
  # WARNING Foxx and arangosh arguments differ --server is used for Foxx not --server.endpoint
  "${FOXX_PREFIX}foxx" test -u "${local_DATABASE_USER}" \
    --server "tcp://${DATAFED_DATABASE_HOST}:8529" \
    -p "${PATH_TO_PASSWD_FILE}" \
    --database "${local_DATABASE_NAME}" \
    "/api/${local_FOXX_MAJOR_API_VERSION}" "$TEST_TO_RUN" --reporter spec --verbose
fi
