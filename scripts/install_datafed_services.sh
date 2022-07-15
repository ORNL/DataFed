#!/bin/bash

#set -exuf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
echo ‘The absolute path of this file is ’ $SOURCE

# Make sure paths exist
mkdir -p /opt/datafed/web
mkdir -p /opt/datafed/core
mkdir -p /opt/datafed/repo
mkdir -p /opt/datafed/keys

# Install web node modules
cp "$SOURCE/../web/package.json" /opt/datafed/web/
cp "$SOURCE/../web/package-lock.json" /opt/datafed/web/

export npm_config_cache=/opt/datafed/web
npm --allow-root --unsafe-perm --prefix /opt/datafed/web install #"$SOURCE/../web/" 
# Install javascript web server repo and core server were 
# already installed by CMake
cp "$SOURCE/../web/datafed-ws.js" /opt/datafed/web

# Copy configuration files
cp "$SOURCE/../config/datafed-core.cfg" /opt/datafed/core
cp "$SOURCE/../config/datafed-ws.cfg" /opt/datafed/web
cp "$SOURCE/../config/datafed-repo.cfg" /opt/datafed/repo
cp "$SOURCE/../config/datafed-authz.cfg" /opt/datafed/authz

# Generate keys
/opt/datafed/core/datafed-core --gen-keys
/opt/datafed/repo/datafed-repo --gen-keys --cred-dir /opt/datafed/keys

# Move keys to /opt/datafed/keys
mv datafed-core-key.pub /opt/datafed/keys/
mv datafed-core-key.priv /opt/datafed/keys/
#mv datafed-ws-key.pub /opt/datafed/keys/
#mv datafed-ws-key.priv /opt/datafed/keys/

# Copy services
cp "$SOURCE/../services/datafed-core.service" /etc/systemd/system
cp "$SOURCE/../services/datafed-ws.service" /etc/systemd/system
cp "$SOURCE/../services/datafed-repo.service" /etc/systemd/system

sudo systemctl daemon-reload

echo "The ArangoDB service should be up and running before you use this command"
sudo systemctl restart datafed-core.service
sudo systemctl restart datafed-ws.service
sudo systemctl restart datafed-repo.service

sudo systemctl status datafed-core.service
sudo systemctl status datafed-ws.service
sudo systemctl status datafed-repo.service

# Enable services on reboot
sudo systemctl enable datafed-core.service
sudo systemctl enable datafed-ws.service
sudo systemctl enable datafed-repo.service
