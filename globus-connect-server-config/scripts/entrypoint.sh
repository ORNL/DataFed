#!/bin/bash
# Entrypoint script for Globus Connect Server container
# Follows DataFed's pattern for running GCS in Docker

set -euf -o pipefail

echo "=== Starting Globus Connect Server Container ==="
echo "Hostname: ${GCS_HOSTNAME}"
echo "IP Address: ${GCS_IP_ADDRESS}"
echo

# Set up user if GCS_UID is specified
if [ -n "${GCS_UID:-}" ]; then
    echo "Setting up user with GCS_UID: ${GCS_UID}"
    if ! id -u "${LOCAL_USER}" >/dev/null 2>&1; then
        useradd -u "${GCS_UID}" -m -s /bin/bash "${LOCAL_USER}"
    else
        usermod -u "${GCS_UID}" "${LOCAL_USER}" || true
    fi
    chown -R "${LOCAL_USER}:${LOCAL_USER}" "${GCS_COLLECTION_ROOT_PATH}" || true
fi

# Verify credentials exist
for file in client_cred.json deployment-key.json; do
    if [ ! -f "/opt/globus-config/${file}" ]; then
        echo "ERROR: ${file} not found at /opt/globus-config/${file}"
        echo "Please run ./bin/init-credentials.sh on the host before starting the container"
        exit 1
    fi
done

# Export credentials for GCS CLI commands
export GCS_CLI_CLIENT_ID=$(jq -r .client < /opt/globus-config/client_cred.json)
export GCS_CLI_CLIENT_SECRET=$(jq -r .secret < /opt/globus-config/client_cred.json)
export GCS_CLI_ENDPOINT_ID=$(jq -r .client_id < /opt/globus-config/deployment-key.json)

# Export credentials for the base entrypoint
export GLOBUS_CLIENT_ID="${GCS_CLI_CLIENT_ID}"
export GLOBUS_CLIENT_SECRET="${GCS_CLI_CLIENT_SECRET}"
export DEPLOYMENT_KEY=$(cat /opt/globus-config/deployment-key.json)
export NODE_SETUP_ARGS="--ip-address ${GCS_IP_ADDRESS}"

echo "Using endpoint ID: ${GCS_CLI_ENDPOINT_ID}"

# Clean up stale files from previous runs
echo "Cleaning up stale files..."
files=("/run/gcs_manager" "/run/gcs_manager/pid" "/var/run/apache2/apache2.pid" "/var/run/httpd/httpd.pid" "/run/globus-gridftp-server.pid")
for file in "${files[@]}"; do
    if [ -e "$file" ]; then
        echo "Removing $file"
        rm -rf "$file"
    fi
done
if [ -L "/run/gcs_manager.sock" ]; then
    echo "Removing symbolic link /run/gcs_manager.sock"
    rm "/run/gcs_manager.sock"
fi

echo
echo "=== Starting Globus Connect Server ===="
echo "Endpoint ID: ${GCS_CLI_ENDPOINT_ID}"
echo "Collection Path: ${GCS_COLLECTION_ROOT_PATH}"
echo

# Activate Python environment for the base entrypoint
source /opt/globus/bin/activate

# Run the GCS entrypoint in the background
echo "Starting GCS services..."
/entrypoint.sh &
ENTRYPOINT_PID=$!

# Check if base entrypoint is still running
sleep 5
if ! kill -0 $ENTRYPOINT_PID 2>/dev/null; then
    echo "ERROR: Base entrypoint exited unexpectedly"
    echo "Checking for error in base entrypoint..."
    wait $ENTRYPOINT_PID
    EXIT_CODE=$?
    echo "Base entrypoint exited with code: $EXIT_CODE"
    exit $EXIT_CODE
fi

# Wait for apache2 to start
echo "Waiting for Apache to start..."
counter=0
while true; do
    data=$(ps aux | awk '{print $11}' | grep apache2 || true)
    if [ -n "${data}" ]; then
        echo "Apache service found to be running!"
        break
    fi
    
    # Check if base entrypoint is still running
    if ! kill -0 $ENTRYPOINT_PID 2>/dev/null; then
        echo "ERROR: Base entrypoint exited while waiting for Apache"
        wait $ENTRYPOINT_PID
        exit $?
    fi
    
    counter=$((counter + 1))
    if [ $counter -gt 60 ]; then
        echo "ERROR: Apache failed to start after 60 seconds"
        kill $ENTRYPOINT_PID 2>/dev/null || true
        exit 1
    fi
    
    echo "Still waiting for apache2 to start..."
    sleep 1
done

# Wait for GridFTP server
echo "Waiting for GridFTP server..."
while [ ! -f /run/globus-gridftp-server.pid ]; do
    echo "Waiting for globus-gridftp-server pid file to be created"
    sleep 1
done
echo "GridFTP server pid file found!"

# Wait for endpoint to be accessible
if [ -f "/var/lib/globus-connect-server/info.json" ]; then
    # Wait a moment for the file to be populated
    sleep 2
    if [ -s "/var/lib/globus-connect-server/info.json" ]; then
        GCS_URL=$(jq -r .domain_name < /var/lib/globus-connect-server/info.json 2>/dev/null || echo "")
        if [ -n "${GCS_URL}" ] && [ "${GCS_URL}" != "null" ]; then
            echo "Waiting for endpoint to be accessible at https://${GCS_URL}/api/info..."
            
            set +e
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}\n" -I "https://${GCS_URL}/api/info" 2>/dev/null || echo "000")
            set -e
            
            minutes=0
            while [ "$HTTP_CODE" != "200" ]; do
                echo "Waiting for domain name (https://${GCS_URL}) to be registered! Code: $HTTP_CODE"
                
                for i in {1..12}; do
                    sleep 5
                    set +e
                    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}\n" -I "https://${GCS_URL}/api/info" 2>/dev/null || echo "000")
                    set -e
                    if [ "$HTTP_CODE" == "200" ]; then
                        break
                    fi
                done
                
                minutes=$((minutes + 1))
                if [ $minutes -gt 10 ]; then
                    echo "WARNING: Endpoint not accessible after 10 minutes, continuing anyway..."
                    break
                fi
            done
            
            if [ "$HTTP_CODE" == "200" ]; then
                echo "Endpoint is accessible!"
            fi
        fi
    fi
fi

echo
echo "=== Globus Connect Server is ready ==="
[ -n "${GCS_URL:-}" ] && echo "Endpoint URL: https://${GCS_URL}"
echo "Collection Path: ${GCS_COLLECTION_ROOT_PATH}"
echo

# Run setup script automatically as the local user
echo "Running automatic setup..."
su -m -c "/opt/scripts/setup-globus.sh" "${LOCAL_USER}"
echo

# Create log directory if it doesn't exist
LOG_DIR="/var/log/globus"
mkdir -p "${LOG_DIR}"

# Keep container running
echo "Container is running. Monitoring logs..."
touch "${LOG_DIR}/gcs-container.log"
tail -f "${LOG_DIR}/gcs-container.log"