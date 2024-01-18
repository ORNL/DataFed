#!/bin/bash

set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# Check if the input script exists
if [ ! -f "$PROJECT_ROOT/config/datafed.sh" ]; then
  echo "Error: 'datafed.sh' not found."
  exit 1
fi

# Process the input script and extract export statements
grep '^export ' "$PROJECT_ROOT/config/datafed.sh" | sed 's/^export \(.*\)="\(.*\)"/\1=\2/' > "$PROJECT_ROOT/.env"

echo "Conversion complete. Output saved to '$PROJECT_ROOT/.env'."
