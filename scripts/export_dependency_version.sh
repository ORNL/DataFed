#!/bin/bash
# Assumes sourcing not running
SCRIPT=$(realpath "${BASH_SOURCE[0]}")
SCRIPT_DIR=$(dirname "${SCRIPT}")
PROJECT_ROOT=$(realpath "${SCRIPT_DIR}/..")
. "${PROJECT_ROOT}/external/DataFedDependencies/scripts/utils.sh"
# WARNING
# For this script to work it must be called with source
# source export_dependency_version_numbers
export_dependency_version_numbers
