#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

# Will remove datafed components, with the exception of
# the certificates because we can only call lego so many times
rm -rf /opt/datafed/core
rm -rf /opt/datafed/web
rm -rf /opt/datafed/repo
rm -rf /opt/datafed/authz

rm -f /etc/systemd/system/datafed* 
rm -f /etc/grid-security/gsi-authz.conf
rm -rf /var/log/datafed

${PROJECT_ROOT}/scripts/clear_db.sh
