#!/bin/bash

# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
set -uf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh
source ${PROJECT_ROOT}/external/getopts_long/lib/getopts_long.bash
Help()
{
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|u|p|y|w]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATABASE_PASSWORD."
  echo "-y, --system-secret               ZeroMQ system secret"
  echo "-w, --wait                        Will run in background until database"
  echo "                                  is started then will install foxx. "
  echo "                                  This is useful for setting up the "
  echo "                                  arangodb docker container"
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

local_WAIT=0

while getopts_long 'hu:p:w help database-user: database-password: wait' OPTION
do
  case "$OPTION" in
    'h'|'help')
        Help
        exit 0
        ;;
    'u'|'database-user')
        local_DATABASE_USER=$OPTARG
        echo "Processing 'Database user' option. Input argument is '$local_DATABASE_USER'"
        ;;
    'p'|'database-password')
        local_DATABASE_PASSWORD=$OPTARG
        ;;
    'y'|'zeromq-system-secret')
        local_DATAFED_ZEROMQ_SYSTEM_SECRET=$OPTARG
        ;;
    'w'|'wait')
        echo "Processing 'wait' option."
        local_WAIT=1
        ;;
    ':')
        echo "Error: Option $OPTARG requires an argument"
        Help
        exit 1
        ;;
    \?)
        echo "Error: Invalid option"
        Help
        exit 1
        ;;
  esac
done
shift $(($OPTIND-1))

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

if [ "$local_WAIT" == "1" ]
then
  running="0"
  while [ "$running" == "0" ]
  do
    sleep 5
    temp=$(ps -e -o comm | grep arangod);
    running=$(if [[ "$temp" =~ ^arangod* ]]; then echo 1; else echo 0; fi);
    echo "Arangodb started $running"
  done
fi

# We are now going to initialize the DataFed database in Arango, but only if sdms database does
# not exist
output=$(curl --dump - --user $local_DATABASE_USER:$local_DATABASE_PASSWORD http://localhost:8529/_api/database/user 2>&1)
count="0"
while [ "$count" != "3" ]
do
  if [[ "$output" =~ .*"Connection refused".* ]]; then
    count=$(($count + 1))
    echo "Unable to connect to database attempt $count."
    sleep 2
    output=$(curl --dump - --user $local_DATABASE_USER:$local_DATABASE_PASSWORD http://localhost:8529/_api/database/user 2>&1)
  else
    break
  fi
done

if [[ "$output" =~ .*"sdms".* ]]; then
	echo "SDMS already exists do nothing"
elif [[ "$output" =~ .*"Connection refused".* ]]; then
  echo "Unable to connect to database check your user name and password."
  exit 1
else
	echo "Creating SDMS"
  arangosh  --server.password ${local_DATABASE_PASSWORD} --server.username ${local_DATABASE_USER} --javascript.execute ${PROJECT_ROOT}/core/database/db_create.js
  # Give time for the database to be created
  sleep 5
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

## Will create the zip file in the build directory to keep datafed source code clean
#cd ../../build
## Zip up the api
#zip datafed.zip ../core/database/api/* 
#
## Get the size of the file in bytes
#bytes=$(wc -c < datafed.zip)

# This is to ensure we are using the right version of node
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion


PATH_TO_PASSWD_FILE=${SOURCE}/database_temp.password
# Install foxx service node module
path_to_foxx=$(which foxx)
if [ -z "$path_to_foxx" ]
then
  npm install --global foxx-cli
else
  foxx_version=$(foxx --version)
  # Version 2.1.0 has an error when using the --database flag
  if [ "$foxx_version" == "2.1.0" ]
  then
    npm install --global --force foxx-cli@2.1.1
  fi
fi

echo "$local_DATABASE_PASSWORD" > ${PATH_TO_PASSWD_FILE}

{ # try
  # Check if database foxx services have already been installed
  existing_services=$(foxx list -a -u $local_DATABASE_USER -p ${PATH_TO_PASSWD_FILE} --database $local_DATABASE_NAME)

  if [[ "$existing_services" =~ .*"DataFed".* ]]
  then
    echo "DataFed Foxx Services have already been uploaded, replacing to ensure consisency"
    foxx replace -u ${local_DATABASE_USER} -p ${PATH_TO_PASSWD_FILE} --database ${local_DATABASE_NAME} /api ${PROJECT_ROOT}/core/database/api/
  else

    foxx install -u ${local_DATABASE_USER} -p ${PATH_TO_PASSWD_FILE} --database ${local_DATABASE_NAME} /api ${PROJECT_ROOT}/core/database/api/
  fi

  

  rm ${PATH_TO_PASSWD_FILE}
} || { # catch
  rm ${PATH_TO_PASSWD_FILE}
}

