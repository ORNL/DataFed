#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")

"${PROJECT_ROOT}/scripts/compose_generate_globus_files.sh" -d "$(pwd)"
