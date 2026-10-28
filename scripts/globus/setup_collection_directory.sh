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
  if [[ ! "$COMPOSE_DIR" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    log_error "Invalid compose directory name"
    exit 1
  fi
  local env_file="${PROJECT_ROOT}/compose/${COMPOSE_DIR}/.env"

  if [ ! -d "${PROJECT_ROOT}/compose/${COMPOSE_DIR}" ]; then
    log_error "Compose directory ${COMPOSE_DIR} does not exist"
    list_compose_directories
    exit 1
  fi

  if [ -f "${env_file}" ]; then
    DATAFED_UID=$(sed -n 's/^DATAFED_UID=//p' "$env_file" | tr -d '\"\047')
    log_info "Loaded environment variables from ${env_file}"
  else
    log_error ".env file not found in ${COMPOSE_DIR}"
    exit 1
  fi

  local required_vars=("DATAFED_UID")
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

setup_directories() {
  local paths_file host_path dir_uid
  paths_file=$(mktemp)
  trap 'rm -f "$paths_file"; trap - RETURN' RETURN
  python3 "${PROJECT_ROOT}/scripts/compose_generate_repositories.py" \
    --directory "${PROJECT_ROOT}/compose/${COMPOSE_DIR}" --host-paths > "$paths_file"
  local -a paths=()
  mapfile -d '' -t paths < "$paths_file"

  # Validate every existing directory before creating any. Ownership changes
  # require an administrator; never recursively chown mounted repository data.
  for host_path in "${paths[@]}"; do
    if [ -e "$host_path" ]; then
      if [ ! -d "$host_path" ]; then
        log_error "Not a directory: $host_path"
        exit 1
      fi
      dir_uid=$(stat -c %u "$host_path")
      if [ "$dir_uid" -ne "$DATAFED_UID" ]; then
        log_error "Directory $host_path must be owned by UID $DATAFED_UID; ask an administrator to set ownership"
        exit 1
      fi
    elif [ "$(id -u)" -ne "$DATAFED_UID" ]; then
      log_error "Run as UID $DATAFED_UID to create $host_path"
      exit 1
    fi
  done
  for host_path in "${paths[@]}"; do
    mkdir -p -- "$host_path"
    log_success "Repository directory ready: $host_path"
  done
}

############################################################
# Driver                                                   #
############################################################
main() {
  parse_arguments "$@"
  validate_environment
  setup_directories
}

main "$@"
