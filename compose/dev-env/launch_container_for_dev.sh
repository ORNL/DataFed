#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")

echo "Running:
  docker run --detach --mount type=bind,src=${PROJECT_ROOT}/,dst=/DataFed/ --name datafed-devenv dev-container:latest
"
docker run --detach --mount type=bind,src=${PROJECT_ROOT}/,dst=/DataFed/ --name datafed-devenv dev-container:latest

echo "Run the following to use your dev environment:
  docker exec -it datafed-devenv /bin/bash

To launch the environment in the container:
  nvim .
"

docker exec -it datafed-devenv /bin/bash