#!/bin/bash

set -exuf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# Make sure paths exist
mkdir -p /opt/datafed/core
mkdir -p /opt/datafed/keys
mkdir -p /var/log/datafed

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-core.cfg" /opt/datafed/core

# Generate keys
/opt/datafed/core/datafed-core --gen-keys

# Move keys to /opt/datafed/keys
mv datafed-core-key.pub /opt/datafed/keys/
mv datafed-core-key.priv /opt/datafed/keys/

# Copy services
cp "$PROJECT_ROOT/services/datafed-core.service" /etc/systemd/system

sudo systemctl daemon-reload

echo "The ArangoDB service should be up and running before you use this command"
sudo systemctl restart datafed-core.service
sudo systemctl status datafed-core.service

# Enable services on reboot
sudo systemctl enable datafed-core.service
