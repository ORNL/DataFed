#!/bin/bash

set -euf 

# This script is created to determine if a harbor image exists in the repository
# It will print the number of artifacts that exist for a particualar image.
LOG_FILE="harbor_check.log"
echo "CI Harbor Check Log File" > "$LOG_FILE"


if [ -z "${DATAFED_HARBOR_PROJECT}" ]
then
  local_DATAFED_HARBOR_PROJECT="datafed"
else
  local_DATAFED_HARBOR_PROJECT=$(printenv DATAFED_HARBOR_PROJECT)
fi

if [ -z "${DATAFED_HARBOR_IMAGE_TAG}" ]
then
  local_DATAFED_HARBOR_IMAGE_TAG="latest"
else
  local_DATAFED_HARBOR_IMAGE_TAG=$(printenv DATAFED_HARBOR_IMAGE_TAG)
fi

# Define an array with variable names
vars=("DATAFED_HARBOR_REGISTRY" "DATAFED_HARBOR_REPOSITORY" "DATAFED_HARBOR_USERNAME" "DATAFED_HARBOR_PASSWORD")

# Loop through the array and set local variables
for var in "${vars[@]}"; do
  eval "local_${var}=\${${var}:-\"\"}"
done

# Check for required variables
for var in "${vars[@]}"; do
  local_var="local_${var}"
  if [ -z "${!local_var}" ]; then
    echo "The ${var} has not been defined." >> "$LOG_FILE"
    exit 1
  fi
done

local_DATAFED_HARBOR_URL="https://$local_DATAFED_HARBOR_REGISTRY"

URL="$local_DATAFED_HARBOR_URL/api/v2.0/projects/$local_DATAFED_HARBOR_PROJECT/repositories/$local_DATAFED_HARBOR_REPOSITORY/artifacts"
echo "$URL" >> "$LOG_FILE"
data=$(curl -u $local_DATAFED_HARBOR_USERNAME:$local_DATAFED_HARBOR_PASSWORD -s "${URL}?with_tag=$local_DATAFED_HARBOR_IMAGE_TAG" )
error_code=$(echo $?)
if [ "$error_code" != "0" ]
then
	echo "Something went wrong when communicating with harbor registry" >> "$LOG_FILE"

	echo "$URL with tag $local_DATAFED_HARBOR_IMAGE_TAG" >> "$LOG_FILE"
	if [ "$error_code" == "6" ]
	then
		echo "cURL error code 6, could not resolve host, make sure the domain is correct $local_DATAFED_HARBOR_URL, and that the network is open, and that the site is up." >> "$LOG_FILE"
	elif [ "$error_code" == "1" ]
	then
		echo "cURL error code 1, generic error code detected, make sure the password username combination is correct." >> "$LOG_FILE"
	fi
fi

# if it is an object, this is not the expected result because we expect an
# array if successful interaction with the API
is_obj=$(echo "$data" | jq 'type == "object"')
if [ "$is_obj" == "true" ]
then
	echo "$data" | jq >> "$LOG_FILE"
fi
number_of_artifacts=$(echo "$data" | jq ' . | length')
echo "Number of artifacts found: $number_of_artifacts" >> "$LOG_FILE"

echo "$number_of_artifacts"
