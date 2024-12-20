#!/bin/bash

# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
# -u has been removed because we have no guarantees that the env variables are defined
set -f -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source "${PROJECT_ROOT}/config/datafed.sh"
source "${SOURCE}/dependency_versions.sh"
source "${SOURCE}/dependency_install_functions.sh"

Help()
{
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
  echo "-y, --system-secret               ZeroMQ system secret"
  echo
  echo "NOTE: Do not run this script with sudo!"
}

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"
local_DATABASE_PORT="8529"

if [ -z "${DATAFED_DATABASE_PASSWORD}" ]
then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

if [ -z "${DATAFED_ZEROMQ_SYSTEM_SECRET}" ]
then
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=""
else
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=$(printenv DATAFED_ZEROMQ_SYSTEM_SECRET)
fi

if [ -z "${FOXX_MAJOR_API_VERSION}" ]
then
  local_FOXX_MAJOR_API_VERSION=$(cat ${PROJECT_ROOT}/cmake/Version.cmake | grep -o -P "(?<=FOXX_API_MAJOR).*(?=\))" | xargs )
else
  local_FOXX_MAJOR_API_VERSION=$(printenv FOXX_MAJOR_API_VERSION)
fi


if [ -z "${DATAFED_DATABASE_HOST}" ]
then
  local_DATAFED_DATABASE_HOST="localhost"
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
fi


VALID_ARGS=$(getopt -o hu:p:f:i:y: --long 'help',database-user:,database-password:,foxx-api-major-version:,database-host:,zeromq-system-secret: -- "$@")
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
    -i | --database-host)
        echo "Processing 'database host' option. Input argument is '$2'"
        local_DATAFED_DATABASE_HOST=$2
        shift 2
        ;;
    -y | --zeromq-system-secret)
        echo "Processing 'DataFed ZeroMQ system secret' option. Input argument is '$2'"
        local_DATAFED_ZEROMQ_SYSTEM_SECRET=$2
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

if [ -z "$local_DATAFED_ZEROMQ_SYSTEM_SECRET" ]
then
  echo "Error DATAFED_ZEROMQ_SYSTEM_SECRET is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -y, --zeromq-session-secret"
  echo "      or with the environment variable DATAFED_ZEROMQ_SYSTEM_SECRET."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]
then
  exit 1
fi

basic_auth="$local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD"
url="http://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}/_api/database/user"
# Do not output to /dev/null we need the output
code=$(curl -s -o /dev/null -w "%{http_code}" --user "$basic_auth" "$url")

if [[ "$code" != "200" ]]; then
  echo "Error detected in attempting to connect to database at $url"
  echo "HTTP code is: $code"
  exit 1
fi

url2="http://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}/_api/database"
# We are now going to initialize the DataFed database in Arango, but only if sdms database does
# not exist
output=$(curl -s -i --dump - --user "$basic_auth" "$url2")

echo "Output: $output"

if [[ "$output" == "" ]]; then
  echo "curl command failed $url2 exiting"
  exit 1
fi


if [[ "$output" =~ .*"sdms".* ]]; then
	echo "SDMS already exists do nothing"
else
	echo "Creating SDMS"
  arangosh  --server.endpoint \
  "tcp://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute "${PROJECT_ROOT}/core/database/foxx/db_create.js"
  # Give time for the database to be created
  sleep 2
  arangosh --server.endpoint "tcp://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute-string 'db._useDatabase("sdms"); db.config.insert({"_key": "msg_daily", "msg" : "DataFed servers will be off-line for regular maintenance every Sunday night from 11:45 pm until 12:15 am EST Monday morning."}, {overwrite: true});'
  arangosh --server.endpoint "tcp://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
    --server.username "${local_DATABASE_USER}" \
    --javascript.execute-string "db._useDatabase(\"sdms\"); db.config.insert({ \"_key\": \"system\", \"_id\": \"config/system\", \"secret\": \"${local_DATAFED_ZEROMQ_SYSTEM_SECRET}\"}, {overwrite: true } );"
fi

# There are apparently 3 different ways to deploy Foxx microservices,
# Using curl with http requests
# Using the Arango web ui 
# Using node module
#
# The web deployment requires manual interaction, and I could not figure out the 
# syntax for the REST http endpoints with curl so we are going to try the node module

# 1. Install nvm which will allow us to update node
echo "Installing nvm"
install_nvm
echo "Installing node"
install_node
echo "Installing foxx_cli"
install_foxx_cli

FOXX_PREFIX=""
if ! command -v foxx > /dev/null 2>&1; then
    FOXX_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm/bin/"
fi

echo "${local_DATAFED_DATABASE_PASSWORD}" > "${SOURCE}/database_temp.password"
PATH_TO_PASSWD_FILE="${SOURCE}/database_temp.password"

echo "Path to PASSWRD file ${PATH_TO_PASSWD_FILE} passwd is $local_DATAFED_DATABASE_PASSWORD"
echo "$local_DATAFED_DATABASE_PASSWORD" > "${PATH_TO_PASSWD_FILE}"

{ # try
  # Check if database foxx services have already been installed
  existing_services=$("${FOXX_PREFIX}foxx" list \
    --server "http://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
    -a -u "$local_DATABASE_USER" \
    -p "${PATH_TO_PASSWD_FILE}" \
    --database "$local_DATABASE_NAME")

  FOUND_API=$(echo "$existing_services" | grep "/api/${local_FOXX_MAJOR_API_VERSION}")


  INSTALL_API="FALSE"
  FOUND_API=$(echo "$existing_services" | grep "/api/${local_FOXX_MAJOR_API_VERSION}")

  echo "$FOUND_API"

  RESULT=$(curl -s http://${local_DATAFED_DATABASE_HOST}:8529/_db/sdms/api/${local_FOXX_MAJOR_API_VERSION}/version)
  CODE=$(echo "${RESULT}" | jq '.code' )
  echo "Code is $CODE"
  if [ -z "${FOUND_API}" ]
  then
      INSTALL_API="TRUE"
  elif [ "$CODE" == "503" ]
  then
      INSTALL_API="TRUE"
    # Remove the api at this point
    "${FOXX_PREFIX}foxx" remove \
      "/api/${local_FOXX_MAJOR_API_VERSION}" \
      --server "http://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
      -u "${local_DATABASE_USER}" \
      -p "${PATH_TO_PASSWD_FILE}" \
      --database "${local_DATABASE_NAME}"
  fi

  echo "$RESULT"
  if [ "${INSTALL_API}" == "TRUE"  ]
  then
    "${FOXX_PREFIX}foxx" install \
      --server "http://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
      -u "${local_DATABASE_USER}" \
      -p "${PATH_TO_PASSWD_FILE}" \
      --database "${local_DATABASE_NAME}" \
      "/api/${local_FOXX_MAJOR_API_VERSION}" \
      "${PROJECT_ROOT}/core/database/foxx/"
  else
    echo "DataFed Foxx Services have already been uploaded, replacing to ensure consisency"
    "${FOXX_PREFIX}foxx" replace \
      --server "http://${local_DATAFED_DATABASE_HOST}:${local_DATABASE_PORT}" \
      -u "${local_DATABASE_USER}" \
      -p "${PATH_TO_PASSWD_FILE}" \
      --database "${local_DATABASE_NAME}" \
      "/api/${local_FOXX_MAJOR_API_VERSION}" "${PROJECT_ROOT}/core/database/foxx/"
    echo "foxx replace -u ${local_DATABASE_USER} -p ${PATH_TO_PASSWD_FILE} --database ${local_DATABASE_NAME} /api/${local_FOXX_MAJOR_API_VERSION} ${PROJECT_ROOT}/core/database/foxx"
  fi
  rm "${PATH_TO_PASSWD_FILE}"
} || { # catch
  rm "${PATH_TO_PASSWD_FILE}"
}

