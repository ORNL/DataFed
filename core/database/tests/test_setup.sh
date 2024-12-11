#!/bin/bash

# History
#
# -e added back in because CI jobs are not failing when there are problems in
# this script. Residual password files can be removed a different way. i.e.  in
# a cleanup script associated with a CI job.
#
# -e has been removed so that if an error occurs the PASSWORD File is deleted
# and not left lying around

set -uef -o pipefail

SCRIPT=$(realpath "$BASH_SOURCE[0]")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../../")
source "${PROJECT_ROOT}/config/datafed.sh"
source "${PROJECT_ROOT}/scripts/dependency_versions.sh"
source "${PROJECT_ROOT}/scripts/dependency_install_functions.sh"

Help()
{
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|u|p|y]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-f, --foxx-api-major-version      The major version number to mount the foxx api under."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATAFED_DATABASE_PASSWORD."
  echo "-y, --system-secret               ZeroMQ system secret"
  echo
  echo "NOTE: Do not run this script with sudo!"
}

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"

if [ -z "${DATAFED_DATABASE_HOST:-}" ]
then
  local_DATAFED_DATABASE_HOST="localhost"
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
fi

if [ -z "${DATAFED_DATABASE_PASSWORD:-}" ]
then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

if [ -z "${DATAFED_ZEROMQ_SYSTEM_SECRET:-}" ]
then
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=""
else
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=$(printenv DATAFED_ZEROMQ_SYSTEM_SECRET)
fi

if [ -z "${FOXX_MAJOR_API_VERSION:-}" ]
then
  local_FOXX_MAJOR_API_VERSION=$(cat ${PROJECT_ROOT}/cmake/Version.cmake | grep -o -P "(?<=FOXX_API_MAJOR).*(?=\))" | xargs )
else
  local_FOXX_MAJOR_API_VERSION=$(printenv FOXX_MAJOR_API_VERSION)
fi

VALID_ARGS=$(getopt -o hu:p:f: --long 'help',database-user:,database-password:,foxx-api-major-version: -- "$@")
if [[ $? -ne 0 ]]; then
      exit 1;
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
    -f | --foxx-api-major-version)
        echo "Processing 'Foxx major api version' option. Input argument is '$2'"
        local_FOXX_MAJOR_API_VERSION=$2
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

# We are now going to initialize the DataFed database in Arango, but only if sdms database does
# not exist
output=$(curl --user $local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD http://${local_DATAFED_DATABASE_HOST}:8529/_api/database/user)

if [[ "$output" =~ .*"sdms".* ]]; then
	echo "SDMS already exists do nothing"
else
	echo "Creating SDMS"
  arangosh  --server.endpoint "tcp://${local_DATAFED_DATABASE_HOST}:8529"   --server.password "${local_DATAFED_DATABASE_PASSWORD}" --server.username "${local_DATABASE_USER}" --javascript.execute "${PROJECT_ROOT}/core/database/foxx/db_create.js"
  # Give time for the database to be created
  sleep 2
  arangosh  --server.endpoint "tcp://${local_DATAFED_DATABASE_HOST}:8529" --server.password "${local_DATAFED_DATABASE_PASSWORD}" --server.username "${local_DATABASE_USER}" --javascript.execute-string 'db._useDatabase("sdms"); db.config.insert({"_key": "msg_daily", "msg" : "DataFed servers will be off-line for regular maintenance every Sunday night from 11:45 pm until 12:15 am EST Monday morning."}, {overwrite: true});'
  arangosh  --server.endpoint "tcp://${local_DATAFED_DATABASE_HOST}:8529" --server.password "${local_DATAFED_DATABASE_PASSWORD}" --server.username "${local_DATABASE_USER}" --javascript.execute-string "db._useDatabase(\"sdms\"); db.config.insert({ \"_key\": \"system\", \"_id\": \"config/system\", \"secret\": \"${local_DATAFED_ZEROMQ_SYSTEM_SECRET}\"}, {overwrite: true } );"
fi

# There are apparently 3 different ways to deploy Foxx microservices,
# Using curl with http requests
# Using the Arango web ui 
# Using node module
#
# The web deployment requires manual interaction, and I could not figure out
# the syntax for the REST http endpoints with curl so we are going to try the
# node module

# Will only install if it is not already installed
install_nvm
install_node

# Install foxx service node module
$NVM_DIR/nvm-exec npm install --global foxx-cli

FOXX_PREFIX=""
if ! command -v foxx > /dev/null 2>&1; then
    FOXX_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm/bin/"
fi

PATH_TO_PASSWD_FILE=${SOURCE}/database_temp.password
echo "$local_DATAFED_DATABASE_PASSWORD" > "${PATH_TO_PASSWD_FILE}"
# Check if database foxx services have already been installed
# WARNING Foxx and arangosh arguments differ --server is used for Foxx not --server.endpoint
existing_services=$("${FOXX_PREFIX}foxx" list -a -u "$local_DATABASE_USER" -p "${PATH_TO_PASSWD_FILE}"  --server "tcp://${local_DATAFED_DATABASE_HOST}:8529"  --database "$local_DATABASE_NAME")
echo "existing services ${existing_services}"

if [[ "$existing_services" =~ .*"DataFed".* ]]
then
  echo "Running tests"
else
  echo "Foxx services have not been installed cannot run tests!"
  exit 1
fi

