#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

systemctl_exists=$( which systemctl )

if [[ ! -z $systemctl_exists ]]
then
  sudo systemctl daemon-reload

  # Turn off exit - on non zero exit code for the below command, we don't want
  # it to exit if arangodb is not reported as active.
  set +e
  arango_status=$(systemctl is-active arangodb3.service)
  set -e
  if [ ! "active" = "$arango_status" ]
  then
    sudo systemctl restart arangodb3.service
  fi

  arango_status=$(systemctl is-active arangodb3.service)
  if [ ! "active" = "$arango_status" ]
  then
    echo "ERROR something is wrong arangodb3.service is not active"
    exit 1
  fi
  # Enable services on reboot
  sudo systemctl enable arangodb3.service
else
  echo "Not starting systemctl service because did not find systemctl."
fi
