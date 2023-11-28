#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"

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

if [ -z "${DATAFED_DATABASE_HOST}" ]
then
  local_DATAFED_DATABASE_HOST="localhost"
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
fi

if [ -z "${DATAFED_DATABASE_PORT}" ]
then
  local_DATAFED_DATABASE_PORT="8529"
else
  local_DATAFED_DATABASE_PORT=$(printenv DATAFED_DATABASE_PORT)
fi

# Delete database and API from arangodb
if command -v arangosh &> /dev/null
then
	exists=$(arangosh --server.endpoint "http+tcp://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}" \
			 --server.usernam "$local_DATABASE_USER" \
			 --server.password "$local_DATAFED_DATABASE_PASSWORD" \
			 --javascript.execute "db._databases().includes('$local_DATABASE_NAME')")

	if [ "$exists" = "true" ]; then
	  arangosh  --server.endpoint
    "tcp://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}" \
      --server.password ${local_DATAFED_DATABASE_PASSWORD} \
      --server.username ${local_DATABASE_USER} \
      --javascript.execute-string "db._dropDatabase('$local_DATABASE_NAME');"
	else
	    echo "Database $local_DATABASE_NAME does not exist."
	fi

fi
