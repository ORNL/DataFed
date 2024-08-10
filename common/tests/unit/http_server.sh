#!/bin/bash

# Get the directory where this script is located
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
# Path to the Python script
PYTHON_SCRIPT="${SOURCE}/http_server.py"

# Print debugging information
echo "SCRIPT_DIR: ${SOURCE}"
echo "PYTHON_SCRIPT: ${PYTHON_SCRIPT}"

# Check if the Python script exists
if [ ! -f "$PYTHON_SCRIPT" ]; then
  echo "Error: $PYTHON_SCRIPT not found"
  exit 1
fi

# Run the Python script
nohup python3 "$PYTHON_SCRIPT" &
