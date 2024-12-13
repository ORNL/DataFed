#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")

docker build \
  -f "${PROJECT_ROOT}/docker/Dockerfile.dependencies" \
  "${PROJECT_ROOT}" \
  -t datafed-dependencies:latest

docker build \
 -f Dockerfile \
 --build-arg DEPENDENCIES="datafed-dependencies:latest" \
 "${PROJECT_ROOT}" \
 -t dev-container:latest