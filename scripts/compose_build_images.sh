#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../")

Help()
{
  echo "$(basename $0) Build images for compose run by default will build all."
  echo
  echo "Syntax: $(basename $0) [-h|r|m]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-r, --repo-images                 Build the repository images for "
  echo "                                  datafed."
  echo "-m, --metadata-images             Build the images for metadata services."
}

VALID_ARGS=$(getopt -o hmr --long 'help',repo-images,metadata-images -- "$@")

BUILD_REPO="TRUE"
BUILD_METADATA="TRUE"
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
    -h | --help)
        Help
        exit 0
        ;;
    -r | --repo-images)
        BUILD_METADATA="FALSE"
        shift 1
        ;;
    -m | --metadata-images)
        BUILD_REPO="FALSE"
        shift 1
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done


if [[ "$BUILD_METADATA" == "TRUE" ]]
then
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
fi

if [[ "$BUILD_REPO" == "TRUE" ]]
then
  source "${PROJECT_ROOT}/scripts/dependency_versions.sh"
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
fi
