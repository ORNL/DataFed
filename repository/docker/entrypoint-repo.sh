#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../..)

${PROJECT_ROOT}/scripts/generate_datafed.sh
${PROJECT_ROOT}/scripts/generate_repo_config.sh
${PROJECT_ROOT}/scripts/install_repo.sh

exec "$@"
