#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

DATABASE_PORT="8529"
DATAFED_DATABASE="sdms"
RESPONSE=""

if [ -z "${DATAFED_DATABASE_HOST}" ]; then
  local_DATAFED_DATABASE_HOST=""
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
fi

if [ -z "${FOXX_MAJOR_API_VERSION}" ]; then
  local_FOXX_MAJOR_API_VERSION=$(cat ${PROJECT_ROOT}/cmake/Version.cmake | grep -o -P "(?<=FOXX_API_MAJOR).*(?=\))" | xargs)
else
  local_FOXX_MAJOR_API_VERSION=$(printenv FOXX_MAJOR_API_VERSION)
fi

establish_connection() {

  local URL="http://${local_DATAFED_DATABASE_HOST}:${DATABASE_PORT}/_db/${DATAFED_DATABASE}/api/${local_FOXX_MAJOR_API_VERSION}/version"
  local CONNECTION="FALSE"
  local count=0
  local max_count=40
  while [ "$CONNECTION" == "FALSE" ]; do
    echo "Attempt $count - Checking Database Connection at: $URL"
    RESPONSE=$(curl -s "$URL")
    local error_code="$?"
    ((count++))
    if [ "$error_code" = "0" ]; then
      echo "Connection made"
      CONNECTION="TRUE"
    else
      sleep 5
    fi

    if [ "$count" -eq "$max_count" ]; then
      echo "Max attempts made exiting!"
      exit 1
    fi
  done
}

foxx_provisioned() {

  local URL="http://${local_DATAFED_DATABASE_HOST}:${DATABASE_PORT}/_db/${DATAFED_DATABASE}/api/${local_FOXX_MAJOR_API_VERSION}/version"
  local FOXX_PROVISIONED="FALSE"
  local count=0
  local max_count=20
  while [ "$FOXX_PROVISIONED" == "FALSE" ]; do
    echo "Attempt $count - Checking foxx endpoint exists: $URL"
    RESPONSE=$(curl -s "$URL")
    local error=$(echo "$RESPONSE" | jq -r .error)
    ((count++))
    if [ "$error" == "true" ]; then
      sleep 5
    else
      echo "Endpoint exists!"
      FOXX_PROVISIONED="TRUE"
    fi

    if [ "$count" -eq "$max_count" ]; then
      echo "Max attempts made exiting!"
      exit 1
    fi
  done
}

establish_connection
foxx_provisioned
exit 0
