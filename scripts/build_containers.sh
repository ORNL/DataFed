#!/bin/bash

docker build -f dockerfiles/dependencies.Dockerfile -t datafed-dependencies .
docker build -f dockerfiles/runtime.Dockerfile -t datafed-runtime .
docker build -f web/Dockerfile -t datafed-ws --build-arg DEPENDENCIES=datafed-dependencies --build-arg RUNTIME=datafed-runtime .
docker build -f core/Dockerfile -t datafed-core --build-arg DEPENDENCIES=datafed-dependencies --build-arg RUNTIME=datafed-runtime .
