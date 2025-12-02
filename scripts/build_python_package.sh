#!/bin/bash
set -e

# Build script for DataFed Python package using Docker
# This script builds the Python package inside a Docker container using DataFed dependencies
# It reads version numbers from cmake/Version.cmake
#
# Environment variables:
# - REGISTRY: Docker registry URL (e.g., camden.ornl.gov). If set, pulls dependencies from registry.
# - HARBOR_USER: Username for registry login (required if REGISTRY is set)
# - HARBOR_DATAFED_GITLAB_CI_REGISTRY_TOKEN: Token for registry login (required if REGISTRY is set)

echo "========================================"
echo "Building DataFed Python Package (Docker)"
echo "========================================"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Project root: ${PROJECT_ROOT}"
cd "${PROJECT_ROOT}"

# Get the dependencies submodule SHA for the DEPENDENCIES build arg
DEPENDENCIES_SHA=$(git submodule status ./external/DataFedDependencies/ | awk '{print $1}' | sed 's/^-//')
echo "Using dependencies SHA: ${DEPENDENCIES_SHA}"

# Determine dependencies image source
DEPENDENCIES_IMAGE=""
if [ -n "${REGISTRY:-}" ]; then
    # CI environment - pull from registry
    echo ""
    echo "Registry detected: ${REGISTRY}"
    DEPENDENCIES_IMAGE="${REGISTRY}/datafed/dependencies:${DEPENDENCIES_SHA}"

    if [ -n "${HARBOR_USER:-}" ] && [ -n "${HARBOR_DATAFED_GITLAB_CI_REGISTRY_TOKEN:-}" ]; then
        echo "Logging in to registry..."
        docker login "${REGISTRY}" -u "${HARBOR_USER}" -p "${HARBOR_DATAFED_GITLAB_CI_REGISTRY_TOKEN}"
    fi

    echo "Pulling dependencies image from registry..."
    docker pull "${DEPENDENCIES_IMAGE}"
else
    # Local development - build or use local image
    echo ""
    echo "No registry specified - using local development mode"
    DEPENDENCIES_IMAGE="datafed-dependencies:${DEPENDENCIES_SHA}"

    echo "Checking for dependencies image..."
    if ! docker image inspect datafed-dependencies:latest >/dev/null 2>&1; then
        echo "Dependencies image not found locally. Building dependencies image..."
        "${PROJECT_ROOT}/external/DataFedDependencies/scripts/build_image.sh"
        # Tag with SHA for consistency
        docker tag datafed-dependencies:latest "${DEPENDENCIES_IMAGE}"
    else
        echo "Dependencies image found: datafed-dependencies:latest"
        # Ensure SHA-tagged version exists
        if ! docker image inspect "${DEPENDENCIES_IMAGE}" >/dev/null 2>&1; then
            docker tag datafed-dependencies:latest "${DEPENDENCIES_IMAGE}"
        fi
    fi
fi

# Build the Python client Docker image
echo ""
echo "Building Python client Docker image..."
echo "Using dependencies: ${DEPENDENCIES_IMAGE}"
docker build \
  --build-arg DEPENDENCIES="${DEPENDENCIES_IMAGE}" \
  -f python/datafed_pkg/docker/Dockerfile \
  -t datafed-python-client:latest \
  .

# Extract the built packages from the Docker image
echo ""
echo "Extracting built packages from Docker image..."
OUTPUT_DIR="${PROJECT_ROOT}/python/datafed_pkg/dist"
mkdir -p "${OUTPUT_DIR}"

# Create a temporary container and copy the dist files
CONTAINER_ID=$(docker create datafed-python-client:latest)
docker cp "${CONTAINER_ID}:/dist/." "${OUTPUT_DIR}/"
docker rm "${CONTAINER_ID}"

echo ""
echo "========================================"
echo "Build completed successfully!"
echo "========================================"
echo "Distributions created in: ${OUTPUT_DIR}/"
ls -lh "${OUTPUT_DIR}/"

echo ""
echo "To deploy to PyPI, run:"
echo "  pip install twine"
echo "  twine upload ${OUTPUT_DIR}/*"

exit 0

