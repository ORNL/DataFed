#!/bin/bash

set -exuf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# Make sure paths exist
mkdir -p /opt/datafed/repo
mkdir -p /opt/datafed/keys
mkdir -p /var/log/datafed

# Copy configuration files
cp "$PROJECT_ROOT/config/gsi-authz.conf" /etc/grid-security
cp "$PROJECT_ROOT/config/datafed-repo.cfg" /opt/datafed/repo
cp "$PROJECT_ROOT/config/datafed-authz.cfg" /opt/datafed/authz

# Generate keys only if they do not exist
if [ ! -f /opt/datafed/keys/datafed-repo-key.priv ]
then
  /opt/datafed/repo/datafed-repo --gen-keys --cred-dir /opt/datafed/keys
fi

# Ensure permissions are correctly set on authz library
chmod 755 /opt/datafed/authz/libdatafed-authz.so

# Copy services
cp "$PROJECT_ROOT/services/datafed-repo.service" /etc/systemd/system

sudo systemctl daemon-reload

echo "The Globus service should be installed before you use this command"
sudo systemctl restart datafed-repo.service
sudo systemctl status datafed-repo.service

# Enable services on reboot
sudo systemctl enable datafed-repo.service

# Update GridFTP so it knows about env variable
PATTERN1="("
PATTERN2=";"
PATH_GRIDFTP_SERVICE=$(sudo systemctl status globus-gridftp-server.service | grep "loaded (" | awk '{print $3}' | sed -e "s/.*$PATTERN1\(.*\)$PATTERN2.*/\1/")
echo "$PATH_GRIDFTP_SERVICE"