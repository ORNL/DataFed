#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# Make sure paths exist
mkdir -p /opt/datafed/web
mkdir -p /opt/datafed/keys
mkdir -p /var/log/datafed

# Install web node modules
cp "$PROJECT_ROOT/web/package.json" /opt/datafed/web/
#cp "$PROJECT_ROOT/web/package-lock.json" /opt/datafed/web/

export npm_config_cache=/opt/datafed/web
npm --allow-root --unsafe-perm --prefix /opt/datafed/web install 
# Install javascript web server repo and core server were 
# already installed by CMake
cp "$PROJECT_ROOT/web/datafed-ws.js" /opt/datafed/web

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-ws.cfg" /opt/datafed/web

# Copy services
cp "$PROJECT_ROOT/services/datafed-ws.service" /etc/systemd/system

# Make sure that the datafed-core-pub.key exists in the web/static folder
if [[ -z  "/opt/datafed/keys/datafed-core-key.pub" ]]
then
  echo "ERROR unable to locate datafed-core-key.pub in /opt/datafed/keys the public key is needed by the web server exiting"
  exit 1
fi

cp /opt/datafed/keys/datafed-core-key.pub "$PROJECT_ROOT/web/static/"

systemctl_exists=$( which systemctl )

if [[ ! -z $systemctl_exists ]]
then
  sudo systemctl daemon-reload

  echo "The ArangoDB service and core service should be up and running before you use this command"
  sudo systemctl restart datafed-ws.service
  sudo systemctl status datafed-ws.service

  # Enable services on reboot
  sudo systemctl enable datafed-ws.service
else
  echo "Not starting systemctl service because did not find systemctl."
fi
