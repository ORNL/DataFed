#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../")
. "${PROJECT_ROOT}/scripts/dependency_versions.sh"

cd "${PROJECT_ROOT}/external/globus-connect-server-deploy/docker"
git checkout "$DATAFED_GCS_SUBMODULE_VERSION"
docker build --progress plain --tag "gcs-ubuntu-base:latest" - < "./docker-files/Dockerfile.ubuntu-20.04"
cd "${PROJECT_ROOT}"
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
  --build-arg GCS_IMAGE="gcs-ubuntu-base" \
  "${PROJECT_ROOT}" \
  -t datafed-gcs:latest
