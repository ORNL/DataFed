#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../")

docker build \
  -f "${PROJECT_ROOT}/docker/Dockerfile.dependencies" \
  "${PROJECT_ROOT}" \
  -t datafed-dependencies:latest
docker build \
  -f "${PROJECT_ROOT}/docker/Dockerfile.runtime" \
  "${PROJECT_ROOT}" \
  -t datafed-runtime:latest
docker build -f \
  "${PROJECT_ROOT}/repository/docker/Dockerfile" \
  --build-arg DEPENDENCIES="datafed-dependencies" \
  --build-arg RUNTIME="datafed-runtime" \
  "${PROJECT_ROOT}" \
  -t datafed-repo:latest
docker build -f \
  "${PROJECT_ROOT}/repository/docker/Dockerfile.gcs" \
  --build-arg DEPENDENCIES="datafed-dependencies" \
  --build-arg RUNTIME="datafed-runtime" \
  "${PROJECT_ROOT}" \
  -t datafed-gcs:latest
