#!/bin/env bash

# Not do not include "-u" in set option, we will be checking for unbound variables
# if that option is set then this script will throw an error when there is none
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

echo "SOURCE Is $SOURCE"
Help()
{
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|t|c|f]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-t, --threads-task                The number of threads available to the datafed    "
  echo "                                  core server for executing tasks."
  echo "-f, --threads-client              The number of threads available to the datafed    "
  echo "                                  core server."
  echo "-c, --cred-dir                    The location of the credential directory where the"
  echo "                                  private keys of the repo server are and the public"
  echo "                                  key of the core server."
  echo "-s, --globus-secret               Globus App secret used by DataFed to authenticate"
  echo "                                  with Globus. This is a REQUIRED parameter. If it"
  echo "                                  is not provided as a command line argument it can "
  echo "                                  be set as an environment variable called"
  echo "                                  DATAFED_GLOBUS_APP_SECRET"
  echo "-i, --globus-id                   Globus App client id used by DataFed to help Globus"
  echo "                                  identify the DataFed application as a Globus app."
  echo "                                  This is a REQUIRED parameter. If it is not provided"
  echo "                                  as a command line argument it can be set as an "
  echo "                                  environment variable called"
  echo "                                  DATAFED_GLOBUS_APP_ID"
  echo "-a, --api-url                     Database api url, the REST api of the database "
  echo "                                  that DataFed interacts with."
  echo "-u, --database-user               Database user, needed to log into the database."
  echo "-p, --database-password           Database password, needed to log into the database."
  echo "                                  This is a REQUIRED parameters if it is not"
  echo "                                  provided via the command line it can also be set"
  echo "                                  using the enviromental variable"
  echo "                                  DATABASE_PASSWORD."
}

# Set defaults use environment variables by default
local_DATAFED_CRED_DIR="/opt/datafed/keys/"
local_DATAFED_CORE_CLIENT_THREADS=2
local_DATAFED_CORE_TASK_THREADS=2

if [ -z "${DATAFED_GLOBUS_APP_ID}" ]
then
  local_DATAFED_GLOBUS_APP_ID=""
else
  local_DATAFED_GLOBUS_APP_ID=$(printenv DATAFED_GLOBUS_APP_ID)
fi

if [ -z "${DATAFED_GLOBUS_APP_SECRET}" ]
then
  local_DATAFED_GLOBUS_APP_SECRET=""
else
  local_DATAFED_GLOBUS_APP_SECRET=$(printenv DATAFED_GLOBUS_APP_SECRET)
fi

local_DATABASE_API_URL="http://127.0.0.1:8529/_db/sdms/api/"
local_DATABASE_USER="root"

if [ -z "${DATABASE_PASSWORD}" ]
then
  local_DATABASE_PASSWORD=""
else
  local_DATABASE_PASSWORD=$(printenv DATABASE_PASSWORD)
fi

VALID_ARGS=$(getopt -o ht:c:f:a:s:i:u:p --long 'help',threads-task:,cred-dir:,threads-client:,api-url:,globus-secret:,globus-id:,database-user:,database-password: -- "$@")
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
    -t | --threads)
        echo "Processing 'threads-task' option. Input argument is '$2'"
        local_DATAFED_CORE_TASK_THREADS=$2
        shift 2
        ;;
    -c | --cred-dir)
        echo "Processing 'credential directory' option. Input argument is '$2'"
        local_DATAFED_CRED_DIR=$2
        shift 2
        ;;
    -f | --threads-client)
        echo "Processing 'threads client' option. Input argument is '$2'"
        local_DATAFED_CORE_CLIENT_THREADS=$2
        shift 2
        ;;
    -a | --api-url)
        echo "Processing 'Database api url' option. Input argument is '$2'"
        local_DATABASE_API_URL=$2
        shift 2
        ;;
    -s | --globus-secret)
        echo "Processing 'DataFed Globus App secret' option. Input argument is '$2'"
        local_DATAFED_GLOBUS_APP_SECRET=$2
        shift 2
        ;;
    -i | --globus-id)
        echo "Processing 'DataFed Globus App client id' option. Input argument is '$2'"
        local_DATAFED_GLOBUS_APP_ID=$2
        shift 2
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
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

ERROR_DETECTED=0
if [ -z "$local_DATAFED_GLOBUS_APP_SECRET" ]
then
  echo "Error DATAFED_GLOBUS_APP_SECRET is not defined, this is a required argument."
  echo "      This variable can be set using the command line option -s, --globus-secret"
  echo "      or with the environment variable DATAFED_GLOBUS_APP_SECRET."
  ERROR_DETECTED=1
fi

if [ -z "$local_DATAFED_GLOBUS_APP_ID" ]
then
  echo "Error DATAFED_GLOBUS_APP_ID is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -i, --globus-id"
  echo "      or with the environment variable DATAFED_GLOBUS_APP_ID."
  ERROR_DETECTED=1
fi

if [ -z "$local_DATABASE_PASSWORD" ]
then
  echo "Error DATABASE_PASSWORD is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -p, --database-password"
  echo "      or with the environment variable DATABASE_PASSWORD."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]
then
  exit 1
fi

PATH_TO_CONFIG_DIR=$(realpath "$SOURCE/../config")

CONFIG_FILE_NAME="datafed-core.cfg"

cat << EOF > "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
# Note this file can be generated with $(basename $0)
cred-dir=$local_DATAFED_CRED_DIR
client-threads=$local_DATAFED_CORE_CLIENT_THREADS
task-threads=$local_DATAFED_CORE_TASK_THREADS
db-url=$local_DATABASE_API_URL
# User for ArangoDB
db-user=$local_DATABASE_USER
# Password to access the database
db-pass=$local_DATABASE_PASSWORD
# Below are the client ids and secrets which are obtained when you
# register an application with Globus, these values should be consistent
# with what is in the datafed-ws.cfg file
client-id=$local_DATAFED_GLOBUS_APP_ID
client-secret=$local_DATAFED_GLOBUS_APP_SECRET
EOF

echo
echo "Config file is being placed here: $PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
echo
echo "Contents are:"
echo 
cat "$PATH_TO_CONFIG_DIR/$CONFIG_FILE_NAME"
