#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# Make sure paths exist
mkdir -p /opt/datafed/core
mkdir -p /opt/datafed/keys
mkdir -p /var/log/datafed

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-core.cfg" /opt/datafed/core


# Move keys to /opt/datafed/keys if they do not already exist
if [ ! -f /opt/datafed/keys/datafed-core-key.priv ]
then
  # Generate keys
  /opt/datafed/core/datafed-core --gen-keys
  mv datafed-core-key.pub /opt/datafed/keys/
  mv datafed-core-key.priv /opt/datafed/keys/
fi

# Copy services
cp "$PROJECT_ROOT/services/datafed-core.service" /etc/systemd/system

systemctl_exists=$( which systemctl )

if [[ ! -z $systemctl_exists ]]
then
sudo systemctl daemon-reload

echo "The ArangoDB service should be up and running before you use this command"
sudo systemctl restart datafed-core.service
sudo systemctl status datafed-core.service

# Enable services on reboot
sudo systemctl enable datafed-core.service
else
  echo "Not starting systemctl service because did not find systemctl."
fi
