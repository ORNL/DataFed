#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")

# Variables specific to running the compose instance
export DATAFED_COMPOSE_REPO_DOMAIN="datafed-repo"

"${PROJECT_ROOT}/scripts/compose_generate_env.sh" -d "$(pwd)" $@

