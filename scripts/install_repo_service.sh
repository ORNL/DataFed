#!/bin/bash

set -exuf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# Make sure paths exist
mkdir -p /opt/datafed/repo
mkdir -p /opt/datafed/keys

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-repo.cfg" /opt/datafed/repo
cp "$PROJECT_ROOT/config/datafed-authz.cfg" /opt/datafed/authz

# Generate keys
/opt/datafed/repo/datafed-repo --gen-keys --cred-dir /opt/datafed/keys

# Copy services
cp "$PROJECT_ROOT/services/datafed-repo.service" /etc/systemd/system

sudo systemctl daemon-reload

echo "The Globus service should be installed before you use this command"
sudo systemctl restart datafed-repo.service
sudo systemctl status datafed-repo.service

# Enable services on reboot
sudo systemctl enable datafed-repo.service
