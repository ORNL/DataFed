#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/../..)

${PROJECT_ROOT}/scripts/generate_datafed.sh
${PROJECT_ROOT}/scripts/generate_core_config.sh
${PROJECT_ROOT}/scripts/generate_core_service.sh
${PROJECT_ROOT}/scripts/install_core_service.sh
${PROJECT_ROOT}/scripts/run_core_service.sh
