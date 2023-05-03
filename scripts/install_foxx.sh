#!/bin/bash

# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
# -u has been removed because we have no guarantees that the env variables are defined
set -f -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

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
  echo "                                  DATABASE_PASSWORD."
  echo "-y, --system-secret               ZeroMQ system secret"
  echo
  echo "NOTE: Do not run this script with sudo!"
}

# Only recognized x.x.x format where all "x" are integers
# Returns true if first version is greater or equal to second version
#
# semantic_version_compatible "1.2.3" "1.1.8"
# echo $? 
# Should print 1
#
# semantic_version_compatible "1.2.3" "1.2.8"
# echo $? 
# Should print 0
#
#semantic_version_compatible "1.1.1" "1.1.1"
#echo "Should return true 1.1.1 >= 1.1.1"
#
#semantic_version_compatible "1.2.1" "1.1.1"
#echo "Should return true 1.2.1 >= 1.1.1"
#
#semantic_version_compatible "1.2.1" "3.1.1"
#echo "Should return false 1.2.1 >= 3.1.1"
#
#semantic_version_compatible "v1.2.1" "v3.1.1"
#echo "Should return false v1.2.1 >= v3.1.1"
#
#semantic_version_compatible "v1.2.1" "1.1.1"
#echo "Should return true v1.2.1 >= 1.1.1"


semantic_version_compatible() {
  local VER1=$1
  local VER2=$2

  # Remove any preceding v from version i.e. v1.1.2
  VER1=$(echo $VER1 | sed 's/v//g' )
  VER2=$(echo $VER2 | sed 's/v//g' )

  maj_1=$(echo $VER1 | sed 's/\./ /g' | awk '{print $1}')
  min_1=$(echo $VER1 | sed 's/\./ /g' | awk '{print $2}')
  patch_1=$(echo $VER1 | sed 's/\./ /g' | awk '{print $3}')
  maj_2=$(echo $VER2 | sed 's/\./ /g' | awk '{print $1}')
  min_2=$(echo $VER2 | sed 's/\./ /g' | awk '{print $2}')
  patch_2=$(echo $VER2 | sed 's/\./ /g' | awk '{print $3}')

  if [ "$maj_1" -gt "$maj_2" ]
  then
    return 1
  elif [ "$maj_1" -lt "$maj_2" ]
  then
    return 0
  fi

  if [ "$min_1" -gt "$min_2" ]
  then
    return 1
  elif [ "$min_1" -lt "$min_2" ]
  then
    return 0
  fi

  if [ "$patch_1" -gt "$patch_2" ]
  then
    return 1
  elif [ "$patch_1" -lt "$patch_2" ]
  then
    return 0
  fi
  return 1
}

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"

if [ -z "${DATABASE_PASSWORD}" ]
then
  local_DATABASE_PASSWORD=""
else
  local_DATABASE_PASSWORD=$(printenv DATABASE_PASSWORD)
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
        local_DATABASE_PASSWORD=$2
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
if [ -z "$local_DATABASE_PASSWORD" ]
then
  echo "Error DATABASE_PASSWORD is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -p, --database-password"
  echo "      or with the environment variable DATABASE_PASSWORD."
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
output=$(curl --dump - --user $local_DATABASE_USER:$local_DATABASE_PASSWORD http://localhost:8529/_api/database/user)

if [[ "$output" =~ .*"sdms".* ]]; then
	echo "SDMS already exists do nothing"
else
	echo "Creating SDMS"
  arangosh  --server.password ${local_DATABASE_PASSWORD} --server.username ${local_DATABASE_USER} --javascript.execute ${PROJECT_ROOT}/core/database/foxx/db_create.js
  # Give time for the database to be created
  sleep 2
  arangosh --server.password ${local_DATABASE_PASSWORD} --server.username ${local_DATABASE_USER} --javascript.execute-string 'db._useDatabase("sdms"); db.config.insert({"_key": "msg_daily", "msg" : "DataFed servers will be off-line for regular maintenance every Sunday night from 11:45 pm until 12:15 am EST Monday morning."}, {overwrite: true});'
  arangosh  --server.password ${local_DATABASE_PASSWORD} --server.username ${local_DATABASE_USER} --javascript.execute-string "db._useDatabase(\"sdms\"); db.config.insert({ \"_key\": \"system\", \"_id\": \"config/system\", \"secret\": \"${local_DATAFED_ZEROMQ_SYSTEM_SECRET}\"}, {overwrite: true } );"
fi

# There are apparently 3 different ways to deploy Foxx microservices,
# Using curl with http requests
# Using the Arango web ui 
# Using node module
#
# The web deployment requires manual interaction, and I could not figure out the 
# syntax for the REST http endpoints with curl so we are going to try the node module
NODE_VERSION="v14.21.3"
actual_version=$(node --version)
semantic_version_compatible $actual_version $NODE_VERSION 
compatible=$?

if [ "$compatible" -eq "0" ]
then
  # 1. Install nvm which will allow us to update node
  if [ ! -d "$HOME/.nvm" ]
  then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
  fi

  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm

  nvm install $NODE_VERSION
  nvm use $NODE_VERSION

  # Install foxx service node module
  $NVM_DIR/nvm-exec npm install --global foxx-cli
else 
  # We are assuming that if the correct version of node is installed then the
  # correct version of npm is also installed
  npm install foxx-cli
fi

PATH_TO_PASSWD_FILE=${SOURCE}/database_temp.password

echo "Path to PASSWRD file ${PATH_TO_PASSWD_FILE} passwd is $local_DATABASE_PASSWORD"
echo "$local_DATABASE_PASSWORD" > "${PATH_TO_PASSWD_FILE}"

{ # try
  # Check if database foxx services have already been installed
  existing_services=$(foxx list -a -u $local_DATABASE_USER -p ${PATH_TO_PASSWD_FILE} --database $local_DATABASE_NAME)

  FOUND_API=$(echo "$existing_services" | grep "/api/${local_FOXX_MAJOR_API_VERSION}")

  if [ -z "${FOUND_API}" ]
  then
    foxx install -u ${local_DATABASE_USER} -p ${PATH_TO_PASSWD_FILE} --database ${local_DATABASE_NAME} /api/${local_FOXX_MAJOR_API_VERSION} ${PROJECT_ROOT}/core/database/foxx/
  else
    echo "DataFed Foxx Services have already been uploaded, replacing to ensure consisency"
    foxx replace -u ${local_DATABASE_USER} -p ${PATH_TO_PASSWD_FILE} --database ${local_DATABASE_NAME} /api/${local_FOXX_MAJOR_API_VERSION} ${PROJECT_ROOT}/core/database/foxx/
    echo "foxx replace -u ${local_DATABASE_USER} -p ${PATH_TO_PASSWD_FILE} --database ${local_DATABASE_NAME} /api/${local_FOXX_MAJOR_API_VERSION} ${PROJECT_ROOT}/core/database/foxx"
  fi

  

  rm ${PATH_TO_PASSWD_FILE}
} || { # catch
  rm ${PATH_TO_PASSWD_FILE}
}

