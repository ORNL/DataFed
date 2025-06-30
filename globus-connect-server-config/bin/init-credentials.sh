#!/bin/bash
# Initialize Globus credentials for GCS configuration
# This script runs the initialization on the host to generate credentials before Docker build

set -euo pipefail

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Globus Credentials Initialization ===${NC}"
echo

# Step 1: Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if .env exists
if [ ! -f "${PROJECT_ROOT}/.env" ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please run ./bin/setup.sh first to create your configuration."
    exit 1
fi

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is required but not found!${NC}"
    echo "Please install Python 3 and try again."
    exit 1
fi

# Check if globus-sdk is installed
if ! python3 -c "import globus_sdk" 2>/dev/null; then
    echo -e "${YELLOW}Installing globus-sdk...${NC}"
    pip3 install globus-sdk || {
        echo -e "${RED}Error: Failed to install globus-sdk${NC}"
        echo "Try: pip3 install --user globus-sdk"
        echo "Or run in a virtual environment"
        exit 1
    }
fi

echo -e "${GREEN}✓ Prerequisites satisfied${NC}"
echo

# Step 2: Load environment variables
echo -e "${YELLOW}Loading configuration...${NC}"

# Create shell-safe version of .env (handles spaces in values)
cp "${PROJECT_ROOT}/.env" "${PROJECT_ROOT}/.env_shell"
sed -i 's/=\([^"]*\)/="\1"/' "${PROJECT_ROOT}/.env_shell"
source "${PROJECT_ROOT}/.env_shell"
rm "${PROJECT_ROOT}/.env_shell"

# Export required variables for init script
export GCS_ROOT_NAME="${GCS_ROOT_NAME}"
export GCS_HOSTNAME="${GCS_HOSTNAME}"
export GCS_CONTROL_PORT="${GCS_CONTROL_PORT:-443}"
export GLOBUS_SUBSCRIPTION_ID="${GLOBUS_SUBSCRIPTION_ID:-}"

# Set paths for credential files
export CRED_FILE_PATH="${PROJECT_ROOT}/globus/client_cred.json"
export DEPLOYMENT_KEY_PATH="${PROJECT_ROOT}/globus/deployment-key.json"

echo -e "${GREEN}✓ Configuration loaded${NC}"
echo

# Step 3: Run initialization script
echo -e "${YELLOW}Initializing Globus credentials...${NC}"
echo "This will open a browser for authentication."
echo

# Change to scripts directory and run init
cd "${PROJECT_ROOT}/scripts"
if python3 init-globus.py; then
    echo
    echo -e "${GREEN}✓ Credentials generated successfully${NC}"
    
    # Step 4: Update .env with generated credentials
    if [ -f "${CRED_FILE_PATH}" ]; then
        echo
        echo -e "${YELLOW}Updating .env with generated credentials...${NC}"
        
        # Update .env file using Python to safely handle special characters
        python3 -c "
import json
import re

# Load credentials
with open('${CRED_FILE_PATH}') as f:
    creds = json.load(f)
    
client_id = creds['client']
client_secret = creds['secret']

# Read .env file
with open('${PROJECT_ROOT}/.env', 'r') as f:
    content = f.read()

# Update or add GLOBUS_CLIENT_ID
if re.search(r'^GLOBUS_CLIENT_ID=', content, re.MULTILINE):
    content = re.sub(r'^GLOBUS_CLIENT_ID=.*$', f'GLOBUS_CLIENT_ID={client_id}', content, flags=re.MULTILINE)
else:
    if not content.endswith('\n'):
        content += '\n'
    content += f'GLOBUS_CLIENT_ID={client_id}\n'

# Update or add GLOBUS_CLIENT_SECRET  
if re.search(r'^GLOBUS_CLIENT_SECRET=', content, re.MULTILINE):
    content = re.sub(r'^GLOBUS_CLIENT_SECRET=.*$', f'GLOBUS_CLIENT_SECRET={client_secret}', content, flags=re.MULTILINE)
else:
    content += f'GLOBUS_CLIENT_SECRET={client_secret}\n'

# Write back to .env file
with open('${PROJECT_ROOT}/.env', 'w') as f:
    f.write(content)
"
        
        echo -e "${GREEN}✓ .env updated with credentials${NC}"
    else
        echo -e "${RED}Warning: Credential file not found after initialization${NC}"
    fi
    
    echo
    echo -e "${GREEN}=== Initialization Complete ===${NC}"
    echo
    echo "Generated files:"
    [ -f "${CRED_FILE_PATH}" ] && echo "  - ${CRED_FILE_PATH}"
    [ -f "${DEPLOYMENT_KEY_PATH}" ] && echo "  - ${DEPLOYMENT_KEY_PATH}"
    echo
    echo "Next steps:"
    echo "1. Build Docker images: ./bin/build.sh"
    echo "2. Start services: docker compose up -d"
else
    echo
    echo -e "${RED}Error: Initialization failed${NC}"
    echo "Please check the error messages above and try again."
    exit 1
fi