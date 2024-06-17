#!/bin/bash

# This script is created to determine if a harbor image exists in the repository
# It will print the number of artifacts that exist for a particualar image.
LOG_FILE="harbor_check.log"
echo "CI Harbor Check Log File" > "$LOG_FILE"

if [ -z "${DATAFED_HARBOR_REGISTRY}" ]
then
  local_DATAFED_HARBOR_REGISTRY=""
else
  local_DATAFED_HARBOR_REGISTRY=$(printenv DATAFED_HARBOR_REGISTRY)
fi

local_DATAFED_HARBOR_URL="https://$local_DATAFED_HARBOR_REGISTRY"

if [ -z "${DATAFED_HARBOR_PROJECT}" ]
then
  local_DATAFED_HARBOR_PROJECT="datafed"
else
  local_DATAFED_HARBOR_PROJECT=$(printenv DATAFED_HARBOR_PROJECT)
fi

# Should be the name of the image
if [ -z "${DATAFED_HARBOR_REPOSITORY}" ]
then
  local_DATAFED_HARBOR_REPOSITORY=""
else
  local_DATAFED_HARBOR_REPOSITORY=$(printenv DATAFED_HARBOR_REPOSITORY)
fi

if [ -z "${DATAFED_HARBOR_IMAGE_TAG}" ]
then
  local_DATAFED_HARBOR_IMAGE_TAG="latest"
else
  local_DATAFED_HARBOR_IMAGE_TAG=$(printenv DATAFED_HARBOR_IMAGE_TAG)
fi

if [ -z "${DATAFED_HARBOR_USERNAME}" ]
then
  local_DATAFED_HARBOR_USERNAME=""
else
  local_DATAFED_HARBOR_USERNAME=$(printenv DATAFED_HARBOR_USERNAME)
fi

if [ -z "${DATAFED_HARBOR_PASSWORD}" ]
then
  local_DATAFED_HARBOR_PASSWORD=""
else
  local_DATAFED_HARBOR_PASSWORD=$(printenv DATAFED_HARBOR_PASSWORD)
fi

if [ -z "$local_DATAFED_HARBOR_REGISTRY" ]
then
  echo "The DATAFED Harbor Registry has not been defined." >> "$LOG_FILE"
  exit 1
fi

if [ -z "$local_DATAFED_HARBOR_REPOSITORY" ]
then
  echo "The DATAFED Harbor Repository has not been defined." >> "$LOG_FILE"
  exit 1
fi

if [ -z "$local_DATAFED_HARBOR_USERNAME" ]
then
  echo "The DATAFED Harbor Username has not been defined." >> "$LOG_FILE"
  exit 1
fi

if [ -z "$local_DATAFED_HARBOR_PASSWORD" ]
then
  echo "The DATAFED Harbor Password has not been defined." >> "$LOG_FILE"
  exit 1
fi

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
number_of_artifacts=$(echo "$data" | jq ' . | length')
echo "Number of artifacts found: $number_of_artifacts" >> "$LOG_FILE"

echo "$number_of_artifacts"
