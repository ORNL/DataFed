#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../)

# Repository server and authz library
docker build -f ${PROJECT_ROOT}/repository/docker/Dockerfile.repo-base.ubuntu ${PROJECT_ROOT}/repository/ -t datafed/repo-base:latest
# Retag 
docker tag datafed/repo-base:latest code.ornl.gov:4567/dlsw/datafed/repo-base:latest
docker build -f ${PROJECT_ROOT}/repository/docker/Dockerfile.repo.ubuntu ${PROJECT_ROOT}/repository/ -t datafed/repo:latest

# Core and Web servers
REPO_LIST=("web" "core")
for REPO in "${REPO_LIST[@]}"
do
  CONTAINER=${REPO}
  docker build -f ${PROJECT_ROOT}/${REPO}/docker/Dockerfile.${REPO}-base.ubuntu ${PROJECT_ROOT}/${REPO}/ -t datafed/${CONTAINER}-base:latest
  # Retag 
  docker tag datafed/${CONTAINER}-base:latest code.ornl.gov:4567/dlsw/datafed/core-base:latest
  docker build -f ${PROJECT_ROOT}/${REPO}/docker/Dockerfile.${REPO}.ubuntu  ${PROJECT_ROOT}/${REPO}/ -t datafed/${CONTAINER}:latest
done

# Python client
docker build -f ${PROJECT_ROOT}/python/docker/Dockerfile.python-client-base.ubuntu ${PROJECT_ROOT}/python/ -t datafed/python-client-base:latest
# Retag
docker tag datafed/python-client-base:latest code.ornl.gov:4567/dlsw/datafed/python-client:latest
docker build -f ${PROJECT_ROOT}/python/docker/Dockerfile.python-client.ubuntu ${PROJECT_ROOT}/python/ -t datafed/python-client:latest
