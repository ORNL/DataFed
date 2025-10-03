#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

set -euf
local_DATABASE_NAME="sdms"
local_DATABASE_USER="root"

if [ -z "${DATAFED_DATABASE_PASSWORD:-}" ]; then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

if [ -z "${DATAFED_DATABASE_HOST:-}" ]; then
  local_DATAFED_DATABASE_HOST="localhost"
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
fi

if [ -z "${DATAFED_DATABASE_PORT:-}" ]; then
  local_DATAFED_DATABASE_PORT="8529"
else
  local_DATAFED_DATABASE_PORT=$(printenv DATAFED_DATABASE_PORT)
fi

# Delete database and API from arangodb
if command -v arangosh &>/dev/null; then
  echo "arangosh --server.endpoint http+tcp://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}"
  echo "  --server.username $local_DATABASE_USER"
  echo "  --server.password $local_DATAFED_DATABASE_PASSWORD"
  echo "  --javascript.execute-string \"print(db._databases().includes('$local_DATABASE_NAME'))\""
  echo "  --log.use-json-format true"

  # NOTE - using arangosh with console.log and bash capture $() was found to
  #        produce inconsistent results. The output was found to not always be
  #        sent to the variable 'output=$(arangosh ... "console.log(db._da...))
  #        using print in the javascript is found to be much more reliable.
  exists=$(
    arangosh --server.endpoint "http+tcp://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}" \
      --server.username "$local_DATABASE_USER" \
      --server.password "$local_DATAFED_DATABASE_PASSWORD" \
      --javascript.execute-string "print(db._databases().includes('$local_DATABASE_NAME'))" \
      --log.use-json-format true
  )

  if [[ "$exists" == "true" ]]; then
    echo "Database exists"
  elif [[ "$exists" == "false" ]]; then
    echo "Database does not exist"
  else
    echo "An error was detected."
    echo "$exists"
    exit 1
  fi

  echo "Does it exist $exists"
  if [ "$exists" = "true" ]; then
    arangosh --server.endpoint "tcp://${local_DATAFED_DATABASE_HOST}:${local_DATAFED_DATABASE_PORT}" \
      --server.password "${local_DATAFED_DATABASE_PASSWORD}" \
      --server.username "${local_DATABASE_USER}" \
      --javascript.execute-string "db._dropDatabase('$local_DATABASE_NAME');"
  else
    echo "Database $local_DATABASE_NAME does not exist."
  fi

fi
