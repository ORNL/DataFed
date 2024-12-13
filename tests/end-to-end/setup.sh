#!/bin/bash

# Removing -u because check for unbound variables
set -ef -o pipefail

# # Description
# 
# This script is designed to set up two DataFed users in the ArangoDB database, this
# cannot be done via the public facing DataFed API because it requires a OAuth flow 
# that requires user interaction.
#
# The public API also does not allow creation of repos and adding allocations this is
# all done via the web API, so these steps are also part of the setup
#
# # Instructions
#
# This script is meant to be run as part of end-to-end testing in a CI environment.
# Care must be taken not to run this script in production as it will wipe the database.
# This script assumes that the tests are being run on the same system as the database.
# There following variables must be defined in the environement before the script can be
# run successfully.
#
# 1. DATAFED_USER89_PASSWORD - the password for datafed89 user
# 2. DATAFED_USER89_GLOBUS_REFRESH_TOKEN - the globus refresh token for datafed89 user
# 3. DATAFED_USER89_GLOBUS_ACCESS_TOKEN - the globus access token for datafed89 user (does not have to be uptodate)
# 4. DATAFED_USER89_GLOBUS_UUID - the UUID of the user account for datafed89 in Globus
#
# 5. DATAFED_USER99_PASSWORD - the password for datafed99 user
# 6. DATAFED_USER99_GLOBUS_REFRESH_TOKEN - the globus refresh token for datafed99 user
# 7. DATAFED_USER99_GLOBUS_ACCESS_TOKEN - the globus access token for datafed99 user (does not have to be uptodate)
# 8. DATAFED_USER99_GLOBUS_UUID - the UUID of the user account for datafed99 in Globus
#
# 9. DATAFED_REPO_FORM_PATH - path to the repo form, this is the repo form that is available as a bash script and can be generated using the /scripts/globus/generate_repo_form.sh script with the --generate-script flag. The form will contain the environmental variables needed to create teh repository in datafed

# Check that required env variables have been set

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"

if [ -z "${DATAFED_DATABASE_PASSWORD}" ]
then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

local_DATAFED_USER89_PASSWORD=""
if [ -z "${DATAFED_USER89_PASSWORD}" ]
then
  echo "REQUIRED env variable DATAFED_USER89_PASSWORD has not been set"
  exit 1
else
  # Search password for special characters ! and replace with correct codes
  # ! = %21
  local_DATAFED_USER89_PASSWORD=$(echo "${DATAFED_USER89_PASSWORD}" | sed 's/!/%21/')
fi

if [ -z "${DATAFED_USER89_GLOBUS_REFRESH_TOKEN}" ]
then
  echo "REQUIRED env variable DATAFED_USER89_GLOBUS_REFRESH_TOKEN has not been set"
  exit 1
fi

if [ -z "${DATAFED_USER89_GLOBUS_ACCESS_TOKEN}" ]
then
  echo "REQUIRED env variable DATAFED_USER89_GLOBUS_ACCESS_TOKEN has not been set"
  exit 1
fi

if [ -z "${DATAFED_USER89_GLOBUS_UUID}" ]
then
  echo "REQUIRED env variable DATAFED_USER89_GLOBUS_UUID has not been set"
  exit 1
fi

if [ -z "${DATAFED_USER99_PASSWORD}" ]
then
  echo "REQUIRED env variable DATAFED_USER99_PASSWORD has not been set"
  exit 1
else
  # Search password for special characters ! and replace with correct codes
  # ! = %21
  local_DATAFED_USER99_PASSWORD=$(echo "${DATAFED_USER99_PASSWORD}" | sed 's/!/%21/')
fi

if [ -z "${DATAFED_USER99_GLOBUS_REFRESH_TOKEN}" ]
then
  echo "REQUIRED env variable DATAFED_USER99_GLOBUS_REFRESH_TOKEN has not been set"
  exit 1
fi

if [ -z "${DATAFED_USER99_GLOBUS_ACCESS_TOKEN}" ]
then
  echo "REQUIRED env variable DATAFED_USER99_GLOBUS_ACCESS_TOKEN has not been set"
  exit 1
fi

if [ -z "${DATAFED_USER99_GLOBUS_UUID}" ]
then
  echo "REQUIRED env variable DATAFED_USER99_GLOBUS_UUID has not been set"
  exit 1
fi

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../../)
source ${PROJECT_ROOT}/config/datafed.sh

if [ -z "${FOXX_MAJOR_API_VERSION}" ]
then
  local_FOXX_MAJOR_API_VERSION=$(cat ${PROJECT_ROOT}/cmake/Version.cmake | grep -o -P "(?<=FOXX_API_MAJOR).*(?=\))" | xargs )
else
  local_FOXX_MAJOR_API_VERSION=$(printenv FOXX_MAJOR_API_VERSION)
fi


# Detect whether arangodb is running locally
{
	ARANGODB_RUNNING=$(systemctl is-active --quiet arangodb3.service && echo "RUNNING")
} || {
	echo "Arangodb service is not locally detected."
}

if [ "${DATAFED_DATABASE_HOST}" == "localhost" ] || [ "${DATAFED_DATABASE_HOST}" == "127.0.0.1" ]
then
	if [ "$ARANGODB_RUNNING" != "RUNNING" ]
	then
	  echo "REQUIRED the arangodb service has not been detected to be running by systemctl"
	  exit 1
	fi
fi

# First step is to clear the database
echo "Clearing old database"
${PROJECT_ROOT}/scripts/clear_db.sh

# Second install foxx
echo "Installing foxx services and API"
${PROJECT_ROOT}/scripts/install_foxx.sh
echo "Completed"

if [ -z "${DATAFED_DATABASE_HOST}" ]
then
  local_DATAFED_DATABASE_HOST=$(hostname -I | awk '{print $1}')
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
fi

if [ -z "${DATAFED_DATABASE_PORT}" ]
then
  local_DATAFED_DATABASE_PORT="8529"
else
  local_DATAFED_DATABASE_PORT=$(printenv DATAFED_DATABASE_PORT)
fi


# If the database was set up correctly auth will be turned on
basic_auth="$local_DATABASE_USER:$local_DATAFED_DATABASE_PASSWORD"

echo "IP is ${local_DATAFED_DATABASE_HOST}"
echo "USER89 GLobud ID $DATAFED_USER89_GLOBUS_UUID"
echo "Refresh is ${DATAFED_USER89_GLOBUS_REFRESH_TOKEN}"
# Chreate user datafed89 who is admin
HTTP_CODE=$( curl --user "${basic_auth}" -w "%{http_code}" -o /dev/null -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/create?name=Data%20Fed&uid=datafed89&uuids=%5B\"${DATAFED_USER89_GLOBUS_UUID}\"%5D&password=${local_DATAFED_USER89_PASSWORD}&email=datafed89%40gmail.com&is_admin=true&secret=${DATAFED_ZEROMQ_SYSTEM_SECRET}" )
echo "HTTP_CODE: ${HTTP_CODE}"
FIRST_INT=${HTTP_CODE:0:1}
if [ "${FIRST_INT}" -ne "2" ]
then
  response=$( curl --user "${basic_auth}" -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/create?name=Data%20Fed&uid=datafed89&uuids=%5B\"${DATAFED_USER89_GLOBUS_UUID}\"%5D&password=${local_DATAFED_USER89_PASSWORD}&email=datafed89%40gmail.com&is_admin=true&secret=${DATAFED_ZEROMQ_SYSTEM_SECRET}" )
  CODE=$(echo $response | jq .code )
  ERROR_MSG=$(echo $response | jq .errorMessage )
  echo "$ERROR_MSG"
  exit 1
fi
# Set globus tokens
HTTP_CODE=$(curl --user "${basic_auth}" -w "%{http_code}" -o /dev/null  -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/token/set?client=u%2Fdatafed89&access=${DATAFED_USER89_GLOBUS_ACCESS_TOKEN}&refresh=${DATAFED_USER89_GLOBUS_REFRESH_TOKEN}&expires_in=1")
echo "HTTP_CODE: ${HTTP_CODE}"
FIRST_INT=${HTTP_CODE:0:1}
if [ "${FIRST_INT}" -ne "2" ]
then
  response=$(curl --user "${basic_auth}" --fail-early -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/token/set?client=u%2Fdatafed89&access=${DATAFED_USER89_GLOBUS_ACCESS_TOKEN}&refresh=${DATAFED_USER89_GLOBUS_REFRESH_TOKEN}&expires_in=1")
  CODE=$(echo $response | jq .code )
  ERROR_MSG=$(echo $response | jq .errorMessage )
  echo "$ERROR_MSG"
  exit 1
fi

# Create user datafed99 who is not admin
HTTP_CODE=$(curl  --user "${basic_auth}"  -w "%{http_code}" -o /dev/null  -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/create?name=Data%20Fed&uid=datafed99&uuids=%5B\"${DATAFED_USER99_GLOBUS_UUID}\"%5D&password=${local_DATAFED_USER99_PASSWORD}&email=datafed99%40gmail.com&is_admin=false&secret=${DATAFED_ZEROMQ_SYSTEM_SECRET}")
echo "HTTP_CODE: ${HTTP_CODE}"
FIRST_INT=${HTTP_CODE:0:1}
if [ "${FIRST_INT}" -ne "2" ]
then
  response=$(curl  --user "${basic_auth}" --fail-early -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/create?name=Data%20Fed&uid=datafed99&uuids=%5B\"${DATAFED_USER99_GLOBUS_UUID}\"%5D&password=${local_DATAFED_USER99_PASSWORD}&email=datafed99%40gmail.com&is_admin=false&secret=${DATAFED_ZEROMQ_SYSTEM_SECRET}")
  CODE=$(echo $response | jq .code )
  ERROR_MSG=$(echo $response | jq .errorMessage )
  echo "$ERROR_MSG"
  exit 1
fi
# Set globus tokens
HTTP_CODE=$(curl --user "${basic_auth}"   -w "%{http_code}" -o /dev/null  -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/token/set?client=u%2Fdatafed99&access=${DATAFED_USER99_GLOBUS_ACCESS_TOKEN}&refresh=${DATAFED_USER99_GLOBUS_REFRESH_TOKEN}&expires_in=1")
echo "HTTP_CODE: ${HTTP_CODE}"
FIRST_INT=${HTTP_CODE:0:1}
if [ "${FIRST_INT}" -ne "2" ]
then
  response=$(curl --user "${basic_auth}"  --fail-early -X GET "http://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}/_db/${local_DATABASE_NAME}/api/${local_FOXX_MAJOR_API_VERSION}/usr/token/set?client=u%2Fdatafed99&access=${DATAFED_USER99_GLOBUS_ACCESS_TOKEN}&refresh=${DATAFED_USER99_GLOBUS_REFRESH_TOKEN}&expires_in=1")
  CODE=$(echo $response | jq .code )
  ERROR_MSG=$(echo $response | jq .errorMessage )
  echo "$ERROR_MSG"
  exit 1
fi

exit 0
#source ${DATAFED_REPO_FORM_PATH}

# Using the datafed89 client because it has admin rights to add the repo
#curl -X POST --header 'accept: application/json' --data-binary @- --dump - "http://${local_DATAFED_DATABASE_HOST}:8529/_db/sdms/api/repo/create?client=u%2Fdatafed89" <<\
#EOF
#{
#  "id" : "$DATAFED_REPO_ID",
#  "title" : "$DATAFED_REPO_TITLE",
#  "desc" : "$DATAFED_REPO_DESCRIPTION", 
#  "domain" : "$DATAFED_REPO_DOMAIN", 
#  "capacity" : "$DATAFED_REPO_CAPACITY", 
#  "pub_key" : "$DATAFED_REPO_PUBLIC_KEY", 
#  "address" : "$DATAFED_REPO_SERVER_ADDRESS", 
#  "endpoint" : "$DATAFED_REPO_ENDPOINT_UUID", 
#  "path" : "$DATAFED_REPO_RELATIVE_PATH", 
#  "exp_path" : "$DATAFED_REPO_EXPORT_PATH", 
#  "admins" : ["u/datafed89"]
#}
#EOF
#
## Using the datafed89 client because it has the repo rights to create an allocation
## Creating an allocation for datafed89
#curl -X GET  "http://${local_DATAFED_DATABASE_HOST}:8529/_db/sdms/api/repo/alloc/create?client=u%2Fdatafed89&subject=u%2Fdatafed89&repo=repo%2F${DATAFED_REPO_ID}&data_limit=1000000000&rec_limit=100" 
#
## Creating an allocation for datafed99
#curl -X GET  "http://${local_DATAFED_DATABASE_HOST}:8529/_db/sdms/api/repo/alloc/create?client=u%2Fdatafed89&subject=u%2Fdatafed99&repo=repo%2F${DATAFED_REPO_ID}&data_limit=1000000000&rec_limit=100" 
