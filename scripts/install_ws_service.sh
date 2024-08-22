#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

# Copy services
cp "$PROJECT_ROOT/services/datafed-ws.service" /etc/systemd/system
