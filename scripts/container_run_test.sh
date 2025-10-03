#!/bin/bash

# This script is designed to check if containers are running.
# It can be used to inform on the state of a particular container,
# or containers assocaited with a particular image

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

Help() {
  echo "$(basename $0) Will stop containers."
  echo
  echo "Syntax: $(basename $0) [-h|n|c|e|t]"
  echo
  echo "Default:"
  echo "By default will check if a single container is running, if more or less will print error message."
  echo "By default will not throw exit code, will only print message."
  echo
  echo "options:"
  echo "-h, --help                     Print this help message"
  echo "-n, --name                     Make sure that a container with this particular name is running."
  echo "-c, --count                    Expected number of containers that should be running"
  echo "                               only really makes sense when testing on the image tag."
  echo "-e, --error-throw              Throw a non 0 exit code if specified container(s) are not running."
  echo "-t, --tag                      Check if containers are running with the particular image tag."
}

# Defaults
local_CONTAINER_COUNT="1"
local_ERROR_THROW="0"
local_NAME_FLAG_DETECTED="0"
local_TAG_FLAG_DETECTED="0"

VALID_ARGS=$(getopt -o hn:c:et: --long 'help',name:,count:,error-throw,tag: -- "$@")
if [[ $? -ne 0 ]]; then
  exit 1
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -n | --name)
    local_CONTAINER_NAME=$2
    local_NAME_FLAG_DETECTED="1"
    shift 2
    ;;
  -c | --count)
    local_CONTAINER_COUNT=$2
    shift 2
    ;;
  -e | --error-throw)
    local_ERROR_THROW="1"
    shift
    ;;
  -t | --tag)
    local_CONTAINER_TAG=$2
    local_TAG_FLAG_DETECTED="1"
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

if [ "$local_TAG_FLAG_DETECTED" == "1" ] && [ "$local_NAME_FLAG_DETECTED" == "1" ]; then
  echo "ERROR can only specify -t or -n cannot specify both"
  exit 1
fi

if [ "$local_TAG_FLAG_DETECTED" == "0" ] && [ "$local_NAME_FLAG_DETECTED" == "0" ]; then
  echo "ERROR must specify an image tag with '-t' or a name '-n' cannot run without"
  exit 1
fi

if [ "$local_TAG_FLAG_DETECTED" == "1" ]; then
  # Get all container ids with that tag and convert to bash array
  CONTAINER_IDS=($(docker container ls --format "{{.ID}}"))
  CONTAINER_IMAGES=($(docker container ls --format "{{.Image}}"))
  CONTAINER_NAMES=($(docker container ls --format "{{.Names}}"))
  CONTAINER_STATES=($(docker container ls --format "{{ .State }}"))

  local_count=0
  for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
    IMAGE="${CONTAINER_IMAGES[$i]}"
    if [ "$IMAGE" == "$local_CONTAINER_TAG" ]; then
      if [ "${CONTAINER_STATES[$i]}" == "running" ]; then
        local_count=$(($local_count + 1))
      fi
    fi
  done

  if [ ! "$local_count" == "$local_CONTAINER_COUNT" ]; then
    echo "ERROR expected $local_CONTAINER_COUNT containers to be running with container image_tag:$local_CONTAINER_TAG but $local_count found instead."
    echo
    for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
      echo "${CONTAINER_IDS[$i]} ${CONTAINER_IMAGES[$i]} ${CONTAINER_NAMES[$i]} ${CONTAINER_STATES[$i]}"
    done

    if [ "$local_ERROR_THROW" == "1" ]; then
      exit 1
    else
      exit 0
    fi
  fi

  echo "Success: $local_CONTAINER_COUNT instances of container image_tag:$local_CONTAINER_TAG found running"

elif [ "$local_NAME_FLAG_DETECTED" == "1" ]; then

  # Get all container ids with that tag and convert to bash array
  CONTAINER_IDS=($(docker container ls --format "{{.ID}}"))
  CONTAINER_IMAGES=($(docker container ls --format "{{.Image}}"))
  CONTAINER_NAMES=($(docker container ls --format "{{.Names}}"))
  CONTAINER_STATES=($(docker container ls --format "{{ .State }}"))

  local_count=0
  for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
    NAME="${CONTAINER_NAMES[$i]}"
    if [ "$NAME" == "$local_CONTAINER_NAME" ]; then
      if [ "${CONTAINER_STATES[$i]}" == "running" ]; then
        local_count=$(($local_count + 1))
      fi
    fi
  done

  if [ ! "$local_count" == "$local_CONTAINER_COUNT" ]; then
    echo "ERROR expected $local_CONTAINER_COUNT containers to be running with container name:$local_CONTAINER_NAME but $local_count found instead."
    echo
    for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
      echo "${CONTAINER_IDS[$i]} ${CONTAINER_IMAGES[$i]} ${CONTAINER_NAMES[$i]} ${CONTAINER_STATES[$i]}"
    done

    if [ "$local_ERROR_THROW" == "1" ]; then
      exit 1
    else
      exit 0
    fi
  fi

  echo "Success: $local_CONTAINER_COUNT instances of container name:$local_CONTAINER_NAME found running"
fi
