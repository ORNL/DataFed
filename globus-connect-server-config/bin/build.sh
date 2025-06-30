#!/bin/bash
# Build script for Globus Connect Server configuration
# This script automatically detects the environment and builds GCS images accordingly

set -euo pipefail

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/../"

# Check dependencies first
echo "Checking dependencies..."
if ! "${SCRIPT_DIR}/check-deps.sh" > /dev/null 2>&1; then
    echo "Error: Missing dependencies. Run ./bin/check-deps.sh for details."
    exit 1
fi

# Load version configuration
source "${CONFIG_DIR}/config/versions.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Building Globus Connect Server Images ===${NC}"
echo "GCS Submodule Version: ${GCS_SUBMODULE_VERSION}"
echo "Base OS: ${GCS_BASE_OS}"
echo

# Detect environment - check if we're in DataFed repository structure
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd 2>/dev/null || echo "")"
EXTERNAL_DIR="${PROJECT_ROOT}/external/globus-connect-server-deploy"
USE_SUBMODULE=false

if [ -n "${PROJECT_ROOT}" ] && [ -d "${EXTERNAL_DIR}" ]; then
    echo "Detected DataFed repository structure - using submodule"
    USE_SUBMODULE=true
else
    echo "Standalone mode - will download GCS deployment tools"
fi
echo

# Step 1: Get GCS deployment tools and build base image
if [ "${USE_SUBMODULE}" = true ]; then
    # DataFed mode - use existing submodule
    echo -e "${YELLOW}Step 1: Building GCS base image from external/globus-connect-server-deploy${NC}"
    cd "${EXTERNAL_DIR}/docker"
    
    # Check out the specified version
    echo "Checking out version ${GCS_SUBMODULE_VERSION}..."
    git checkout "${GCS_SUBMODULE_VERSION}" || {
        echo -e "${RED}ERROR: Failed to checkout version ${GCS_SUBMODULE_VERSION}${NC}"
        echo "Available tags:"
        git tag | tail -10
        exit 1
    }
    
    # Build the base image
    echo "Building ${GCS_BASE_IMAGE_NAME}:latest..."
    docker build --progress plain --tag "${GCS_BASE_IMAGE_NAME}:latest" - < "./docker-files/Dockerfile.${GCS_BASE_OS}"
else
    # Standalone mode - download to temp directory
    echo -e "${YELLOW}Step 1: Downloading and building GCS base image${NC}"
    
    # Create temporary directory for build
    TEMP_DIR=$(mktemp -d)
    # shellcheck disable=SC2064
    trap "rm -rf ${TEMP_DIR}" EXIT
    
    echo "Downloading Globus Connect Server deployment tools..."
    cd "${TEMP_DIR}"
    
    # Clone the globus-connect-server-deploy repository
    git clone --depth 1 --branch "${GCS_SUBMODULE_VERSION}" \
        https://github.com/globus/globus-connect-server-deploy.git
    
    # Build the base image
    echo "Building ${GCS_BASE_IMAGE_NAME}:latest..."
    cd globus-connect-server-deploy/docker
    docker build --progress plain --tag "${GCS_BASE_IMAGE_NAME}:latest" - < "./docker-files/Dockerfile.${GCS_BASE_OS}"
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Base image built successfully${NC}"
else
    echo -e "${RED}✗ Failed to build base image${NC}"
    exit 1
fi

# Step 2: Build our custom image
echo
echo -e "${YELLOW}Step 2: Building custom GCS configuration image${NC}"
cd "${CONFIG_DIR}"

docker build \
    --build-arg GCS_BASE_IMAGE="${GCS_BASE_IMAGE_NAME}:latest" \
    -t "${GCS_FINAL_IMAGE_NAME}:latest" \
    -f docker/Dockerfile \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Custom image built successfully${NC}"
else
    echo -e "${RED}✗ Failed to build custom image${NC}"
    exit 1
fi

# Summary
echo
echo -e "${GREEN}=== Build Complete ===${NC}"
echo "Images created:"
echo "  - ${GCS_BASE_IMAGE_NAME}:latest (GCS base)"
echo "  - ${GCS_FINAL_IMAGE_NAME}:latest (with custom configuration)"
echo
echo "Build mode: $([ "${USE_SUBMODULE}" = true ] && echo "DataFed repository" || echo "Standalone")"
echo
echo "Next steps:"
echo "1. Initialize Globus credentials (if not already done):"
echo "   ./bin/init-credentials.sh"
echo
echo "2. Start the container:"
echo "   docker compose up -d"