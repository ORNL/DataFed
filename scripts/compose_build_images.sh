#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../")

Help()
{
  echo "$(basename $0) Build images for compose run by default will build all."
  echo
  echo "Syntax: $(basename $0) [-h|r|m|b]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-r, --repo-images                 Build the repository images for "
  echo "                                  datafed."
  echo "-m, --metadata-images             Build the images for metadata services."
  echo "-b, --base-image                  Specify the base image to build off of"
  echo "                                  may be necessary if specific certs "
  echo "                                  are required."
}

VALID_ARGS=$(getopt -o hmrb: --long 'help',repo-images,metadata-images,base-image: -- "$@")

BUILD_REPO="TRUE"
BUILD_METADATA="TRUE"
BASE_IMAGE=""
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
    -b | --base-image)
        BASE_IMAGE="$2"
        shift 2
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

echo "BASE_IMAGE:     $BASE_IMAGE"
echo "BUILD_METADATA: $BUILD_METADATA"
echo "BUILD_REPO:     $BUILD_REPO"

if [[ "$BUILD_METADATA" == "TRUE" ]]
then
  if [ "$BASE_IMAGE" == "" ]
  then
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.dependencies" \
      "${PROJECT_ROOT}" \
      -t datafed-dependencies:latest
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.runtime" \
      "${PROJECT_ROOT}" \
      -t datafed-runtime:latest
  else
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.dependencies" \
      "${PROJECT_ROOT}" \
      --build-arg BASE_IMAGE=$BASE_IMAGE \
      -t datafed-dependencies:latest
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.runtime" \
      "${PROJECT_ROOT}" \
      --build-arg BASE_IMAGE=$BASE_IMAGE \
      -t datafed-runtime:latest
  fi
  docker build -f \
    "${PROJECT_ROOT}/core/docker/Dockerfile" \
    --build-arg DEPENDENCIES="datafed-dependencies:latest" \
    --build-arg RUNTIME="datafed-runtime:latest" \
    "${PROJECT_ROOT}" \
    -t datafed-core:latest
  docker build -f \
    "${PROJECT_ROOT}/web/docker/Dockerfile" \
    --build-arg DEPENDENCIES="datafed-dependencies:latest" \
    --build-arg RUNTIME="datafed-runtime" \
    --target ws-build \
    "${PROJECT_ROOT}" \
    -t datafed-web-build:latest
  docker build -f \
    "${PROJECT_ROOT}/web/docker/Dockerfile" \
    --build-arg DEPENDENCIES="datafed-dependencies:latest" \
    --build-arg RUNTIME="datafed-runtime" \
    "${PROJECT_ROOT}" \
    -t datafed-web:latest
  docker build -f \
    "${PROJECT_ROOT}/docker/Dockerfile.foxx" \
    --build-arg DEPENDENCIES="datafed-dependencies:latest" \
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
  if [ "$BASE_IMAGE" == "" ]
  then
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.dependencies" \
      "${PROJECT_ROOT}" \
      -t datafed-dependencies:latest
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.runtime" \
      "${PROJECT_ROOT}" \
      -t datafed-runtime:latest
  else
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.dependencies" \
      "${PROJECT_ROOT}" \
      --build-arg BASE_IMAGE=$BASE_IMAGE \
      -t datafed-dependencies:latest
    docker build \
      -f "${PROJECT_ROOT}/docker/Dockerfile.runtime" \
      "${PROJECT_ROOT}" \
      --build-arg BASE_IMAGE=$BASE_IMAGE \
      -t datafed-runtime:latest

  fi
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
