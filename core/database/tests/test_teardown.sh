#!/bin/bash

# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
set -uf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../../")
source "${PROJECT_ROOT}/config/datafed.sh"

PATH_TO_PASSWD_FILE="${SOURCE}/database_temp.password"
rm "${PATH_TO_PASSWD_FILE}"
