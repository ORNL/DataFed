#!/bin/bash
# Entrypoint script for Globus Connect Server container

set -euo pipefail

echo "=== Starting Globus Connect Server Container ==="
echo "Hostname: ${GCS_HOSTNAME}"
echo "IP Address: ${GCS_IP_ADDRESS}"
echo

# Set up user if UID is specified
if [ -n "${UID:-}" ]; then
    echo "Setting up user with UID: ${UID}"
    if id -u ${LOCAL_USER} >/dev/null 2>&1; then
        usermod -u ${UID} ${LOCAL_USER}
    else
        useradd -u ${UID} -m -s /bin/bash ${LOCAL_USER}
    fi
    
    # Fix ownership of directories
    chown -R ${LOCAL_USER}:${LOCAL_USER} ${GCS_COLLECTION_ROOT_PATH} || true
    chown -R ${LOCAL_USER}:${LOCAL_USER} /opt/globus || true
fi

# Check for required files
if [ ! -f "/opt/globus/client_cred.json" ]; then
    echo "ERROR: Client credentials not found at /opt/globus/client_cred.json"
    echo "Please run the initialization script first:"
    echo "  docker-compose run --rm globus-connect-server python3 /opt/scripts/init-globus.py"
    exit 1
fi

# Extract credentials from files
export GCS_CLI_CLIENT_ID=$(jq -r .client < /opt/globus/client_cred.json)
export GCS_CLI_CLIENT_SECRET=$(jq -r .secret < /opt/globus/client_cred.json)

# Check if deployment key exists
if [ ! -f "/opt/globus/deployment-key.json" ]; then
    echo "Deployment key not found, running endpoint setup..."
    
    # Ensure we have required environment variables
    if [ -z "${GCS_ORGANIZATION:-}" ] || [ -z "${GCS_CONTACT_EMAIL:-}" ]; then
        echo "ERROR: GCS_ORGANIZATION and GCS_CONTACT_EMAIL must be set for initial setup"
        exit 1
    fi
    
    # Get project ID from the client credentials
    # Note: In a real setup, you might want to pass this as an env variable
    echo "Running globus-connect-server endpoint setup..."
    
    globus-connect-server endpoint setup \
        "${GCS_HOSTNAME}" \
        --organization "${GCS_ORGANIZATION}" \
        --contact-email "${GCS_CONTACT_EMAIL}" \
        --agree-to-letsencrypt-tos \
        --deployment-key /opt/globus/deployment-key.json \
        --ip-address ${GCS_IP_ADDRESS}
    
    if [ ! -f "/opt/globus/deployment-key.json" ]; then
        echo "ERROR: Deployment key creation failed"
        exit 1
    fi
fi

# Extract endpoint ID from deployment key
export GCS_CLI_ENDPOINT_ID=$(jq -r .client_id < /opt/globus/deployment-key.json)
export DEPLOYMENT_KEY=$(cat /opt/globus/deployment-key.json)

echo "Using endpoint ID: ${GCS_CLI_ENDPOINT_ID}"

# Clean up any stale files from previous runs
echo "Cleaning up stale files..."
rm -f /run/gcs_manager /run/gcs_manager/pid /run/apache2/apache2.pid /run/httpd/httpd.pid /run/globus-gridftp-server.pid
rm -f /run/gcs_manager.sock

# Run node setup if this is the first time
if [ ! -f "/var/lib/globus-connect-server/info.json" ]; then
    echo "Running node setup..."
    globus-connect-server node setup --ip-address ${GCS_IP_ADDRESS}
fi

# Start GCS services in the background
echo "Starting Globus Connect Server services..."
/usr/sbin/globus-connect-server-start &
GCS_PID=$!

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Wait for Apache to be running
while ! pgrep apache2 >/dev/null; do
    echo "Waiting for Apache to start..."
    sleep 2
done
echo "Apache is running"

# Wait for GridFTP server
while [ ! -f /run/globus-gridftp-server.pid ]; do
    echo "Waiting for GridFTP server to start..."
    sleep 2
done
echo "GridFTP server is running"

# Get the domain name from GCS info
if [ -f "/var/lib/globus-connect-server/info.json" ]; then
    GCS_URL=$(jq -r .domain_name < /var/lib/globus-connect-server/info.json)
    echo "GCS URL: https://${GCS_URL}"
    
    # Wait for the endpoint to be accessible
    echo "Waiting for endpoint to be accessible..."
    while ! curl -s -o /dev/null -w "%{http_code}" "https://${GCS_URL}/api/info" | grep -q "200"; do
        echo -n "."
        sleep 5
    done
    echo " Ready!"
fi

# Run the setup script to configure storage gateways and collections
echo "Running storage gateway and collection setup..."
/opt/scripts/setup-globus.sh

# Create a marker file to indicate successful setup
touch /opt/globus/.setup_complete

echo
echo "=== Globus Connect Server is running ==="
echo "Endpoint ID: ${GCS_CLI_ENDPOINT_ID}"
echo "Collection Path: ${GCS_COLLECTION_ROOT_PATH}"
echo
echo "To create guest collections, use the Globus web interface or CLI"
echo

# Keep the container running and show logs
tail -f /var/log/globus-connect-server/*.log