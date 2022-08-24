#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
source ${SOURCE}/datafed.sh

# Will remove datafed components
rm -rf /opt/datafed
rm /etc/systemd/system/datafed* 

# Delete database and API from arangodb
