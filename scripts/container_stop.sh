#!/bin/bash
# This script is designed to help clear out running containers

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

Help() {
  echo "$(basename $0) Will stop containers."
  echo
  echo "Syntax: $(basename $0) [-h|n|t|p]"
  echo
  echo "Default:"
  echo "If no arguments are provided will stop all running containers."
  echo
  echo "options:"
  echo "-h, --help                     Print this help message"
  echo "-n, --name                     Remove this particular container provide the name"
  echo "-t, --tag                      Remove all containers with this particular image"
  echo "-p, --prefix                   Only require the prefix to match and not"
  echo "                               an exact match"
}

local_NAME_FLAG_DETECTED="0"
local_TAG_FLAG_DETECTED="0"
local_EXACT_MATCH="TRUE"
# Time in seconds
SLEEP_TIME=30

VALID_ARGS=$(getopt -o hn:t:p --long 'help',name:,tag:,prefix -- "$@")
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
  -t | --tag)
    local_CONTAINER_TAG=$2
    local_TAG_FLAG_DETECTED="1"
    shift 2
    ;;
  -p | --prefix)
    local_EXACT_MATCH="FALSE"
    shift 1
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

# Get all container ids with that tag and convert to bash array
CONTAINER_IDS=($(docker container ls --format "{{.ID}}"))
CONTAINER_IMAGES=($(docker container ls --format "{{.Image}}"))
CONTAINER_NAMES=($(docker container ls --format "{{.Names}}"))

if [ "$local_TAG_FLAG_DETECTED" == "1" ]; then

  for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
    IMAGE="${CONTAINER_IMAGES[$i]}"
    if [ "${local_EXACT_MATCH}" == "TRUE" ]; then
      if [ "$IMAGE" == "$local_CONTAINER_TAG" ]; then
        echo "Stopping ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} $IMAGE"
        docker container stop --time "$SLEEP_TIME" "${CONTAINER_IDS[$i]}"
      fi
    else
      if [[ "$IMAGE" == "$local_CONTAINER_TAG"* ]]; then
        echo "Stopping ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} $IMAGE"
        docker container stop --time "$SLEEP_TIME" "${CONTAINER_IDS[$i]}"
      fi
    fi
  done

elif [ "$local_NAME_FLAG_DETECTED" == "1" ]; then

  for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
    NAME="${CONTAINER_NAMES[$i]}"
    if [ "${local_EXACT_MATCH}" == "TRUE" ]; then
      if [ "$NAME" == "$local_CONTAINER_NAME" ]; then
        echo "Stopping ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} ${CONTAINER_IMAGES[$i]}"
        docker container stop --time "$SLEEP_TIME" "${CONTAINER_IDS[$i]}"
      fi
    else
      if [[ "$NAME" == "$local_CONTAINER_NAME"* ]]; then
        echo "Stopping ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} ${CONTAINER_IMAGES[$i]}"
        docker container stop --time "$SLEEP_TIME" "${CONTAINER_IDS[$i]}"
      fi
    fi
  done

else

  for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
    echo "Stopping ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} ${CONTAINER_IMAGES[$i]}"
    docker container stop --time "$SLEEP_TIME" "${CONTAINER_IDS[$i]}"
  done

fi

if [ ! "${#CONTAINER_IDS[@]}" == "0" ]; then
  sleep "$SLEEP_TIME"
fi

# Make sure the specified containers are not running
CONTAINER_IDS=($(docker container ls --format "{{.ID}}"))
CONTAINER_IMAGES=($(docker container ls --format "{{.Image}}"))
CONTAINER_NAMES=($(docker container ls --format "{{.Names}}"))

if [ "$local_TAG_FLAG_DETECTED" == "1" ]; then

  for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
    IMAGE="${CONTAINER_IMAGES[$i]}"
    if [ "${local_EXACT_MATCH}" == "TRUE" ]; then
      if [ "$IMAGE" == "$local_CONTAINER_TAG" ]; then
        echo "ERROR still running ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} $IMAGE"
        exit 1
      fi
    else
      if [[ "$IMAGE" == "$local_CONTAINER_TAG"* ]]; then
        echo "ERROR still running ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} $IMAGE"
        exit 1
      fi
    fi
  done

elif [ "$local_NAME_FLAG_DETECTED" == "1" ]; then

  for ((i = 0; i < ${#CONTAINER_IDS[@]}; i++)); do
    NAME="${CONTAINER_NAMES[$i]}"
    if [ "${local_EXACT_MATCH}" == "TRUE" ]; then
      if [ "$NAME" == "$local_CONTAINER_NAME" ]; then
        echo "ERROR still running ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} ${CONTAINER_IMAGES[$i]}"
        exit 1
      fi
    else
      if [[ "$NAME" == "$local_CONTAINER_NAME"* ]]; then
        echo "ERROR still running ${CONTAINER_IDS[$i]} ${CONTAINER_NAMES[$i]} ${CONTAINER_IMAGES[$i]}"
        exit 1
      fi
    fi
  done

else

  if [ ! "${#CONTAINER_IDS[@]}" == "0" ]; then
    docker container ls
    exit 1
  fi

fi
