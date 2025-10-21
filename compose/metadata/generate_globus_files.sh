#!/bin/bash
SCRIPT=$(realpath "${BASH_SOURCE[0]}")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")

"${PROJECT_ROOT}/scripts/compose_generate_web_server_globus_credentials.sh" -d "$(pwd)"
