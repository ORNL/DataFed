#!/bin/bash

set -euf

Help() {
  echo "$(basename ${BASH_SOURCE[0]}) Will check to make sure that the selected"
  echo "               docker image has been uploaded to the registry."
  echo
  echo "Syntax: $(basename ${BASH_SOURCE[0]}) [-h|r]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-r, --repository                  The container image repository."
}

# Define an array with variable names
vars=("DATAFED_HARBOR_REGISTRY" "DATAFED_HARBOR_REPOSITORY" "DATAFED_HARBOR_USERNAME" "DATAFED_HARBOR_PASSWORD")

# Loop through the array and set local variables
for var in "${vars[@]}"; do
  eval "local_${var}=\${${var}:-\"\"}"
done

VALID_ARGS=$(getopt -o hr: --long 'help',repository: -- "$@")
if [[ $? -ne 0 ]]; then
  exit 2
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -r | --repository)
    local_DATAFED_HARBOR_REPOSITORY=$2
    shift 2
    ;;
  --)
    shift
    break
    ;;
  \?) # incorrect option
    echo "Error: Invalid option"
    exit
    ;;
  esac
done

# This script is created to determine if a harbor image exists in the repository
# It will print the number of artifacts that exist for a particualar image.
LOG_FILE="harbor_check.log"
echo "CI Harbor Check Log File" >"$LOG_FILE"

if [ -z "${DATAFED_HARBOR_PROJECT:-}" ]; then
  local_DATAFED_HARBOR_PROJECT="datafed"
else
  local_DATAFED_HARBOR_PROJECT=$(printenv DATAFED_HARBOR_PROJECT)
fi

if [ -z "${DATAFED_HARBOR_IMAGE_TAG:-}" ]; then
  local_DATAFED_HARBOR_IMAGE_TAG="latest"
else
  local_DATAFED_HARBOR_IMAGE_TAG=$(printenv DATAFED_HARBOR_IMAGE_TAG)
fi

# Check for required variables
for var in "${vars[@]}"; do
  local_var="local_${var}"
  if [ -z "${!local_var}" ]; then
    echo "The ${var} has not been defined." >>"$LOG_FILE"
    exit 1
  fi
done

local_DATAFED_HARBOR_URL="https://$local_DATAFED_HARBOR_REGISTRY"

# Note HARBOR_REPOSITORY should not include the project path that is kept in the
# variable DATAFED_HARBOR_PROJECT
#
# i.e. the below is correct
#
# local_DATAFED_HARBOR_PROJECT="datafed"
# local_DATAFED_HARBOR_REPOSITORY="core-devel"
URL="$local_DATAFED_HARBOR_URL/api/v2.0/projects/$local_DATAFED_HARBOR_PROJECT/repositories/$local_DATAFED_HARBOR_REPOSITORY/artifacts"
echo "${URL}?with_tag=$local_DATAFED_HARBOR_IMAGE_TAG" >>"$LOG_FILE"
# This requires artifact permissions for the token
data=$(curl -u "$local_DATAFED_HARBOR_USERNAME:$local_DATAFED_HARBOR_PASSWORD" -s "${URL}?with_tag=$local_DATAFED_HARBOR_IMAGE_TAG")

echo "$data" >>"$LOG_FILE"
# In the case that an image has not yet been uploaded the server will return
# a json object of the following format
#
# {
#   "errors": [
#     {
#       "code": "NOT_FOUND",
#       "message": "path /api/v2.0/projects/datafed/repositories/gcs-1086-bug-python-client-pypi-version/artifacts was not found"
#     }
#   ]
# }
#
# If credentials are wrong.
#
# {
#   "errors": [
#     {
#       "code": "UNAUTHORIZED",
#       "message": "unauthorized"
#     }
#   ]
# }
#
# If authorization scope is wrong (needs artifact access)
#
# {
#   "errors": [
#     {
#       "code": "FORBIDDEN",
#       "message": "forbidden"
#     }
#   ]
# }

error_code=$(echo $?)
if [ "$error_code" != "0" ]; then
  echo "Something went wrong when communicating with harbor registry" >>"$LOG_FILE"

  echo "$URL with tag $local_DATAFED_HARBOR_IMAGE_TAG" >>"$LOG_FILE"
  if [ "$error_code" == "6" ]; then
    echo "cURL error code 6, could not resolve host, make sure the domain is correct $local_DATAFED_HARBOR_URL, and that the network is open, and that the site is up." >>"$LOG_FILE"
  elif [ "$error_code" == "1" ]; then
    echo "cURL error code 1, generic error code detected, make sure the password username combination is correct." >>"$LOG_FILE"
  fi
fi

# if it is an object, this is not the expected result because we expect an
# array if successful interaction with the API
is_obj=$(echo "$data" | jq 'type == "object"')
if [ "$is_obj" == "true" ]; then
  echo "$data" | jq >>"$LOG_FILE"
fi
number_of_artifacts=$(echo "$data" | jq ' . | length')

# Make sure the response doesn't contain an error code before assumptions are made
if [ "$number_of_artifacts" != "0" ]; then
  # Can only check for errors with .errors if it is an object not if it is an
  # array
  if [ "$is_obj" == "true" ]; then
    ERROR_FOUND=$(echo "$data" | jq -r 'if .errors and (.errors | length > 0) then "TRUE" else "FALSE" end')
    if [ "$ERROR_FOUND" == "TRUE" ]; then
      ERROR_CODE=$(echo "$data" | jq -r '.errors[0].code')
      if [ "$ERROR_CODE" == "NOT_FOUND" ]; then
        echo "0"
        exit 0
      else
        echo "Aborting unhandled error $ERROR_CODE" >>"$LOG_FILE"
        exit 1
      fi
    fi
  fi
fi

echo "Number of artifacts found: $number_of_artifacts" >>"$LOG_FILE"

# Otherwise we assume the object contains the list of objects
echo "$number_of_artifacts"
