#!/bin/bash
# Description
#
# This script sets up a collection directory for DataFed.
# It checks for necessary permissions and environment variables,
# creates the directory if it doesn't exist, and sets the correct ownership.
set -euf -o pipefail

readonly SCRIPT=$(realpath "${BASH_SOURCE}")
readonly SOURCE=$(dirname "$SCRIPT")
readonly PROJECT_ROOT=$(realpath "${SOURCE}"/../../)
readonly FILENAME=$(basename "${BASH_SOURCE}")

log_error() { echo "ERROR: $*" >&2; }
log_info() { echo "INFO: $*"; }
log_success() { echo "SUCCESS: $*"; }

############################################################
# Functions                                                #
############################################################
Help() {
  echo "${FILENAME} sets up a collection directory for DataFed."
  echo
  echo "Syntax: ${FILENAME} [-h|c]"
  echo "options:"
  echo "-h, --help                           Print this help message."
  echo "-c, --compose-directory-name         The name of the compose directory your .env file is in."
}

list_compose_directories() {
  echo "Available compose directories:"
  if composes=$(ls -l "${PROJECT_ROOT}/compose/" | grep "^d"); then
    echo "$composes"
  else
    echo "No compose directories found."
  fi
}

parse_arguments() {
  local VALID_ARGS
  VALID_ARGS=$(getopt -o hc: --long help,compose-directory-name: -- "$@")
  if [[ $# -eq 0 ]]; then
    Help
    exit 1
  fi
  eval set -- "$VALID_ARGS"

  while true; do
    case "$1" in
    -h | --help)
      Help
      exit 0
      ;;
    -c | --compose-directory-name)
      COMPOSE_DIR="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      log_error "Invalid option"
      exit 1
      ;;
    esac
  done

  if [ -z "${COMPOSE_DIR:-}" ]; then
    log_error "-c|--compose-directory-name is required"
    exit 1
  fi
}

validate_environment() {
  local env_file="${PROJECT_ROOT}/compose/${COMPOSE_DIR}/.env"

  if [ ! -d "${PROJECT_ROOT}/compose/${COMPOSE_DIR}" ]; then
    log_error "Compose directory ${COMPOSE_DIR} does not exist"
    list_compose_directories
    exit 1
  fi

  if [ -f "${env_file}" ]; then
    source <(grep -v '^#' "${env_file}")
    log_info "Loaded environment variables from ${env_file}"
  else
    log_error ".env file not found in ${COMPOSE_DIR}"
    exit 1
  fi

  local required_vars=("DATAFED_UID" "DATAFED_HOST_COLLECTION_MOUNT" "DATAFED_REPO_ID_AND_DIR")
  for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
      log_error "${var} is not set"
      exit 1
    fi
  done

  if ! [[ "${DATAFED_UID}" =~ ^[0-9]+$ ]]; then
    log_error "DATAFED_UID must be a valid numeric user ID"
    exit 1
  fi
}

check_permissions() {
  local host_collection_dir="${DATAFED_HOST_COLLECTION_MOUNT}/${DATAFED_REPO_ID_AND_DIR}"

  if [ ! -w "$(dirname "${DATAFED_HOST_COLLECTION_MOUNT}")" ]; then
    log_error "Insufficient permissions to create ${host_collection_dir}"
    exit 1
  fi

  if [ -d "${DATAFED_HOST_COLLECTION_MOUNT}" ]; then
    log_info "Directory ${DATAFED_HOST_COLLECTION_MOUNT} exists, validating UID ownership"
    local dir_uid
    dir_uid=$(stat -c %u "${DATAFED_HOST_COLLECTION_MOUNT}")

    if [ "${dir_uid}" -ne "${DATAFED_UID}" ]; then
      log_error "Directory UID doesn't match expected UID ${DATAFED_UID}"
      echo "Please see an administrator to chown the directory, or choose another directory"
      exit 1
    fi
  fi
}

setup_directory() {
  local host_collection_dir="${DATAFED_HOST_COLLECTION_MOUNT}/${DATAFED_REPO_ID_AND_DIR}"

  if [ -d "${host_collection_dir}" ]; then
    log_info "Directory ${host_collection_dir} already exists, skipping creation"
  else
    mkdir -p "${host_collection_dir}"
    log_success "Created new collection directory ${host_collection_dir}"
  fi
}

############################################################
# Driver                                                   #
############################################################
main() {
  parse_arguments "$@"
  validate_environment
  check_permissions
  setup_directory
}

main "$@"
