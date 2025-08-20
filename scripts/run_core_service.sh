#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

systemctl_exists=$(which systemctl)

if [[ ! -z $systemctl_exists ]]; then
  sudo systemctl daemon-reload

  echo "The ArangoDB service should be up and running before you use this command"
  sudo systemctl restart datafed-core.service
  sudo systemctl status datafed-core.service

  # Enable services on reboot
  sudo systemctl enable datafed-core.service
else
  echo "Not starting systemctl service because did not find systemctl."
fi
