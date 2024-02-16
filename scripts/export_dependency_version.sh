#!/bin/bash
#SCRIPT=$(realpath "$0")
# Assumes sourcing not running
SCRIPT=$( realpath "${BASH_SOURCE[0]}" )
SCRIPT_DIR=$( dirname "${SCRIPT}" )
PROJECT_ROOT=$(realpath ${SCRIPT_DIR}/..)

echo "SCRIPT $SCRIPT"
echo "SCRIPT_DIR $SCRIPT_DIR"
echo "PROJECT_ROOT $PROJECT_ROOT"
#"SOURCE ${SOURCEl}"
. "${PROJECT_ROOT}/scripts/utils.sh"
#
#echo "PROJECT ROOT $PROJECT_ROOT"
## WARNING
## For this script to work it must be called with source
## source export_dependency_version_numbers
export_dependency_version_numbers
