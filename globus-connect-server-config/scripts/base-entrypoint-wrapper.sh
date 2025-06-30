#!/bin/bash
# Wrapper for the base GCS entrypoint that handles already-configured endpoints

set -euf -o pipefail

# Check if node is already configured
if [ -f "/var/lib/globus-connect-server/gcs-manager/etc/gcs.conf" ]; then
    echo "Node already configured, skipping node setup..."
    
    # The base entrypoint has two main sections:
    # 1. Node setup (which we skip)
    # 2. Service launching
    
    # We need to manually launch the services since we're skipping the entrypoint
    
    echo "Launching GCS Manager..."
    mkdir -p /run/gcs_manager
    chown gcsweb:gcsweb /run/gcs_manager
    ln -sf /run/gcs_manager/sock /run/gcs_manager.sock
    
    (
        cd /opt/globus/share/web
        sudo -u gcsweb -g gcsweb /opt/globus/bin/gunicorn \
            --workers 4 \
            --preload api_app \
            --daemon \
            --bind=unix:/run/gcs_manager/sock \
            --pid /run/gcs_manager/pid
    )
    
    # Wait for GCS Manager
    while [ ! -f /run/gcs_manager/pid ]; do
        sleep 0.5
    done
    
    # Fix socket permissions
    chmod 600 /run/gcs_manager/sock
    chown www-data:www-data /run/gcs_manager/sock
    
    echo "Launching GCS Assistant..."
    sudo -u gcsweb -g gcsweb /opt/globus/bin/python \
        /opt/globus/lib/python/globus/portal/assistant/__main__.py \
        /var/lib/globus-connect-server/gcs-manager \
        --log-level=ERROR &
    
    echo "Launching Apache httpd..."
    if [ -f /usr/sbin/apache2 ]; then
        # Enable required modules
        a2enmod headers proxy proxy_http ssl rewrite >/dev/null 2>&1 || true
        a2ensite tls-mod-globus >/dev/null 2>&1 || true
        
        # Start Apache
        /usr/sbin/apache2ctl start
    fi
    
    echo "Launching GridFTP Server..."
    /usr/sbin/globus-gridftp-server \
        -c /etc/gridftp.conf \
        -C /etc/gridftp.d \
        -pidfile /run/globus-gridftp-server.pid \
        -log-level ERROR,WARN,INFO \
        -daemon
    
    echo "GCS container successfully deployed"
    
    # Keep running
    while true; do
        sleep 60
    done
    
else
    echo "Node not configured, running standard entrypoint..."
    exec /entrypoint.sh
fi