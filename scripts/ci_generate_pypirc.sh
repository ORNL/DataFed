#!/bin/bash

# Not do not include "-u" in set option, we will be checking for unbound variables
# if that option is set then this script will throw an error when there is none
set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

if [ -z "${TWINE_CONFIG_FILE}" ]; then
  local_TWINE_CONFIG_FILE=".pypirc"
else
  local_TWINE_CONFIG_FILE=$(printenv TWINE_CONFIG_FILE)
fi

if [ -z "${DATAFED_PYPI_REPO_TOKEN}" ]; then
  local_DATAFED_PYPI_REPO_TOKEN=""
else
  local_DATAFED_PYPI_REPO_TOKEN=$(printenv DATAFED_PYPI_REPO_TOKEN)
fi

cat <<EOF >"$local_TWINE_CONFIG_FILE"
[distutils]
  index-servers = pypi

[pypi]
  username = __token__
  password = $local_DATAFED_PYPI_REPO_TOKEN
EOF
