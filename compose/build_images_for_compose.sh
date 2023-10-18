#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../)

REPO_LIST=("repository" "web" "core")

for REPO in "${REPO_LIST[@]}"
do
  CONTAINER=${REPO}
  docker build -f ${PROJECT_ROOT}/${REPO}/docker/Dockerfile  ${PROJECT_ROOT}/${REPO}/ -t dataafed/${CONTAINER}:latest
done
