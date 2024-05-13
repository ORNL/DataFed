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
  "${PROJECT_ROOT}/core/docker/Dockerfile" \
  --build-arg DEPENDENCIES="datafed-dependencies" \
  --build-arg RUNTIME="datafed-runtime" \
  "${PROJECT_ROOT}" \
  -t datafed-core:latest
docker build -f \
  "${PROJECT_ROOT}/web/docker/Dockerfile" \
  --build-arg DEPENDENCIES="datafed-dependencies" \
  --build-arg RUNTIME="datafed-runtime" \
  "${PROJECT_ROOT}" \
  -t datafed-web:latest
docker build -f \
  "${PROJECT_ROOT}/docker/Dockerfile.foxx" \
  --build-arg DEPENDENCIES="datafed-dependencies" \
  --build-arg RUNTIME="datafed-runtime" \
  "${PROJECT_ROOT}" \
  -t datafed-foxx:latest

