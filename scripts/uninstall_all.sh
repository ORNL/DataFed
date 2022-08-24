#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh

# Will remove datafed components
rm -rf /opt/datafed
rm /etc/systemd/system/datafed* 

# Delete database and API from arangodb
