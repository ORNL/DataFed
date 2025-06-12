#!/bin/bash

# History
#
# -e added back in because CI jobs are not failing when there are problems in
# this script. Residual password files can be removed a different way. i.e.  in
# a cleanup script associated with a CI job.
#
# -e has been removed so that if an error occurs the PASSWORD File is deleted
# and not left lying around
set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../../")
source "${PROJECT_ROOT}/config/datafed.sh"

PATH_TO_PASSWD_FILE="${SOURCE}/database_temp.password"
rm "${PATH_TO_PASSWD_FILE}"
