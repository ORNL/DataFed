#!/bin/bash

# History
#
# -e has been added back, password file deletion should be handled by another
# means such as the CI after script section. If the API fails to install, it
# could lead to improper testing the CI env.
#
# -e has been removed so that if an error occurs the PASSWORD File is deleted
# and not left lying around
#
# -u has been removed because we have no guarantees that the env variables are
# defined
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
DATAFED_PROJECT_ROOT=$(realpath ${SOURCE}/..)
source "${DATAFED_PROJECT_ROOT}/config/datafed.sh"
source "${DATAFED_PROJECT_ROOT}/external/DataFedDependencies/scripts/dependency_versions.sh"
source "${DATAFED_PROJECT_ROOT}/external/DataFedDependencies/scripts/dependency_install_functions.sh"

Help() {
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|u|f|p|i|y]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-f, --foxx-api-major-version      The major version number to mount the foxx api under."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATAFED_DATABASE_PASSWORD."
  echo "-i, --database-host               The hostname or IP address of the "
  echo "                                  database, the env variable: "
  echo "                                  DATAFED_DATABASE_HOST can also be "
  echo "                                  used."
  echo
  echo "NOTE: Do not run this script with sudo!"
  echo
  echo "NOTE: This script respects the SSL_CERT_FILE env variable, which can "
  echo "be used to communicate over https:// ssl:// for certificates that may"
  echo "not be registered in the certificate store."
}

local_DATABASE_API_SCHEME="${DATABASE_API_SCHEME:-http}"
local_SSL_CERT_FILE="${SSL_CERT_FILE:-}"
local_ARANGOSH_SERVER_ENDPOINT_SCHEME="tcp"
local_CURL_SSL_ARG=""
NODE_EXTRA_CA_CERTS=""
if [[ ! -z "${local_SSL_CERT_FILE}" ]]; then
    if [ -f "${local_SSL_CERT_FILE}" ]; then
        echo ""
	echo "INFO - Found ssl certificates for arango! Building with https."
	echo "${local_SSL_CERT_FILE}"
	echo ""
        # Only run if defined and not empty, API_SCHEME must be https in this case
        local_DATABASE_API_SCHEME="https"
        local_CURL_SSL_ARG="--cacert $local_SSL_CERT_FILE"
        # So foxx will trust the certificate
        export NODE_EXTRA_CA_CERTS="$local_SSL_CERT_FILE"
    else
        echo ""
	echo "WARNING - SSL_CERT_FILE is defined but the file does not exist! Assuming,"
	echo "          communication with the database will be over http not https."
	echo "$local_SSL_CERT_FILE"
        echo ""
    fi
fi

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"
local_DATABASE_PORT="8529"

if [ -z "${DATAFED_DATABASE_PASSWORD}" ]; then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

if [ -z "${FOXX_MAJOR_API_VERSION}" ]; then
  local_FOXX_MAJOR_API_VERSION=$(cat ${DATAFED_PROJECT_ROOT}/cmake/Version.cmake | grep -o -P "(?<=FOXX_API_MAJOR).*(?=\))" | xargs)
else
  local_FOXX_MAJOR_API_VERSION=$(printenv FOXX_MAJOR_API_VERSION)
fi

if [ -z "${DATAFED_DATABASE_HOST}" ]; then
  local_DATAFED_DATABASE_HOST="localhost"
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
fi

VALID_ARGS=$(getopt -o hu:p:f:i: --long 'help',database-user:,database-password:,foxx-api-major-version:,database-host: -- "$@")
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
  -f | --foxx-api-major-version)
    local_FOXX_MAJOR_API_VERSION=$2
    shift 2
    ;;
  -i | --database-host)
    local_DATAFED_DATABASE_HOST=$2
    shift 2
    ;;
  --)
    shift
    break
    ;;
  \?) # incorrect option
    echo "ERROR - Invalid option"
    exit
    ;;
  esac
done

ERROR_DETECTED=0
if [ -z "$local_DATAFED_DATABASE_PASSWORD" ]; then
  echo "ERROR - DATAFED_DATABASE_PASSWORD is not defined, this is a required argument"
  echo "        This variable can be set using the command line option -p, --database-password"
  echo "        or with the environment variable DATAFED_DATABASE_PASSWORD."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

basic_auth="$local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD"

if [ "${local_DATABASE_API_SCHEME}" == "https" ]; then
  set +e
  output=$(LD_LIBRARY_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}:$LD_LIBRARY_PATH" curl ${local_CURL_SSL_ARG} --user "$basic_auth" ${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT} 2>&1)
  error_code="$?"
  set -e

  if [ "$error_code" == "60" ]; then
    echo "ERROR - Untrusted certificate detected of address ${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}"
    echo "$output"
    exit 1
  fi

  local_ARANGOSH_SERVER_ENDPOINT_SCHEME="ssl"
fi

url="${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}/_api/database/user"
# Do not output to /dev/null we need the output
code=$(LD_LIBRARY_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}:$LD_LIBRARY_PATH" curl ${local_CURL_SSL_ARG} -s -o /dev/null -w "%{http_code}" --user "$basic_auth" "$url")

if [[ "$code" != "200" ]]; then
  echo "ERROR - Attempting to connect to database at $url"
  echo "        HTTP code is: $code"
  exit 1
fi

url2="${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}/_api/database"
# We are now going to initialize the DataFed database in Arango, but only if sdms database does
# not exist
output=$(LD_LIBRARY_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}:$LD_LIBRARY_PATH" curl ${local_CURL_SSL_ARG} -s -i --user "$basic_auth" "$url2")

if [[ "$output" == "" ]]; then
  echo "ERROR - curl command failed $url2 exiting"
  exit 1
fi

if [[ "$output" =~ .*"sdms".* ]]; then
  echo "INFO - SDMS already exists do nothing."
else
  echo "INFO - Creating SDMS"
  arangosh --server.endpoint \
    "${local_ARANGOSH_SERVER_ENDPOINT_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute "${DATAFED_PROJECT_ROOT}/core/database/foxx/db_create.js"
  # Give time for the database to be created
  sleep 2
  arangosh --server.endpoint "${local_ARANGOSH_SERVER_ENDPOINT_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute-string 'db._useDatabase("sdms"); db.config.insert({"_key": "msg_daily", "msg" : "DataFed servers will be off-line for regular maintenance every Sunday night from 11:45 pm until 12:15 am EST Monday morning."}, {overwrite: true});'
  arangosh --server.endpoint "${local_ARANGOSH_SERVER_ENDPOINT_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute-string "db._useDatabase(\"sdms\"); db.config.insert({ \"_key\": \"system\", \"_id\": \"config/system\"}, {overwrite: true } );"
fi

# There are apparently 3 different ways to deploy Foxx microservices,
# Using curl with http requests
# Using the Arango web ui
# Using node module
#
# The web deployment requires manual interaction, and I could not figure out the
# syntax for the REST http endpoints with curl so we are going to try the node module

# 1. Install nvm which will allow us to update node
echo "INFO - Installing nvm"
install_nvm
echo "INFO - Installing node"
install_node
echo "INFO - Installing foxx_cli"
install_foxx_cli

FOXX_PREFIX=""
if ! command -v foxx >/dev/null 2>&1; then
  FOXX_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm/bin/"
fi

echo "${local_DATAFED_DATABASE_PASSWORD}" >"${SOURCE}/database_temp.password"
PATH_TO_PASSWD_FILE="${SOURCE}/database_temp.password"

echo "$local_DATAFED_DATABASE_PASSWORD" >"${PATH_TO_PASSWD_FILE}"

{ # try
  # Check if database foxx services have already been installed
  existing_services=$("${FOXX_PREFIX}foxx" list \
    --server "${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    -a -u "$local_DATABASE_USER" \
    -p "${PATH_TO_PASSWD_FILE}" \
    --database "$local_DATABASE_NAME")

  FOUND_API=$(echo "$existing_services" | grep "/api/${local_FOXX_MAJOR_API_VERSION}")

  INSTALL_API="FALSE"
  FOUND_API=$(echo "$existing_services" | grep "/api/${local_FOXX_MAJOR_API_VERSION}")

  RESULT=$(LD_LIBRARY_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}:$LD_LIBRARY_PATH" curl ${local_CURL_SSL_ARG} -s ${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}/_db/sdms/api/${local_FOXX_MAJOR_API_VERSION}/version)
  CODE=$(echo "${RESULT}" | jq '.code')
  if [ -z "${FOUND_API}" ]; then
    echo "INFO - API found at ${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}/_db/sdms/api/${local_FOXX_MAJOR_API_VERSION}/version"
    INSTALL_API="TRUE"
  elif [ "$CODE" == "503" ]; then
    echo "WARNING - $CODE returned, attempting to remove api at /api/${local_FOXX_MAJOR_API_VERSION}"
    INSTALL_API="TRUE"
    # Remove the api at this point
    # WARNING Foxx and arangosh arguments differ --server is used for Foxx not --server.endpoint
    "${FOXX_PREFIX}foxx" remove \
      "/api/${local_FOXX_MAJOR_API_VERSION}" \
      --server "${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
      -u "${local_DATABASE_USER}" \
      -p "${PATH_TO_PASSWD_FILE}" \
      --database "${local_DATABASE_NAME}"
  fi

  if [ "${INSTALL_API}" == "TRUE" ]; then
    echo "INFO - Installing arango foxx services at /api/${local_FOXX_MAJOR_API_VERSION}"
    # WARNING Foxx and arangosh arguments differ --server is used for Foxx not --server.endpoint
    "${FOXX_PREFIX}foxx" install \
      --server "${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
      -u "${local_DATABASE_USER}" \
      -p "${PATH_TO_PASSWD_FILE}" \
      --database "${local_DATABASE_NAME}" \
      "/api/${local_FOXX_MAJOR_API_VERSION}" \
      "${DATAFED_PROJECT_ROOT}/core/database/foxx/"
  else
    echo "INFO - Replacing arango foxx services at /api/${local_FOXX_MAJOR_API_VERSION}"
    # WARNING Foxx and arangosh arguments differ --server is used for Foxx not --server.endpoint
    "${FOXX_PREFIX}foxx" replace \
      --server "${local_DATABASE_API_SCHEME}://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
      -u "${local_DATABASE_USER}" \
      -p "${PATH_TO_PASSWD_FILE}" \
      --database "${local_DATABASE_NAME}" \
      "/api/${local_FOXX_MAJOR_API_VERSION}" "${DATAFED_PROJECT_ROOT}/core/database/foxx/"
  fi
  rm "${PATH_TO_PASSWD_FILE}"
} || { # catch
  echo "ERROR - Unexpected error encountered!"
  rm "${PATH_TO_PASSWD_FILE}"
}
