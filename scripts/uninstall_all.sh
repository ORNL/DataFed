#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

# Will remove datafed components, with the exception of
# the certificates because we can only call lego so many times
rm -f /opt/datafed/keys/*priv
rm -f /opt/datafed/keys/*pub
rm -rf /opt/datafed/core
rm -rf /opt/datafed/web
rm -rf /opt/datafed/repo
rm -rf /opt/datafed/authz

rm -f /etc/systemd/system/datafed* 
rm -f /etc/grid-security/gsi-authz.conf

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
arangosh  --server.password ${local_DATABASE_PASSWORD} --server.username ${local_DATABASE_USER} --javascript.execute-string 'db._dropDatabase("sdms");'
