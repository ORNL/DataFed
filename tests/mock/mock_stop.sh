#!/bin/bash
SCRIPT=$(realpath "${BASH_SOURCE[0]}")
SOURCE=$(dirname "$SCRIPT")

echo "Stopping Mock Server"
kill $(cat ./server.pid) && rm -f ./server.pid
cat ./mock.log
