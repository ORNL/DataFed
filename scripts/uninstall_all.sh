#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

# Will remove datafed components, with the exception of
# the certificates because we can only call lego so many times
rm -rf ${DATAFED_INSTALL_PATH}/core
rm -rf ${DATAFED_INSTALL_PATH}/web
rm -rf ${DATAFED_INSTALL_PATH}/repo
rm -rf ${DATAFED_INSTALL_PATH}/authz

rm -f /etc/systemd/system/datafed* 
rm -f /etc/grid-security/gsi-authz.conf
# If the path is overwritten and the value that is not found in datafed.sh
# is used to install a particular component then this will not suffice
rm -rf ${DATAFED_DEFAULT_LOG_PATH}

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

# Delete database and API from arangodb
if command -v arangosh &> /dev/null
then
  arangosh  --server.password ${local_DATABASE_PASSWORD} --server.username ${local_DATABASE_USER} --javascript.execute-string 'db._dropDatabase("sdms");'
fi
