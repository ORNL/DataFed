#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

Help() {
  echo "$(basename $0) Build .env file for compose."
  echo
  echo "Syntax: $(basename $0) [-h|d|r|m|c|f|a]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-d, --directory                   Directory where .env will be created."
  echo "-r, --repo-images                 Create .env for just repo services."
  echo "-m, --metadata-images             Create .env for just metadata services"
  echo "-c, --no-overwrite-certs          Do not overwrite existing certificates"
  echo "-f, --force                       Force overwrite existing .env file"
  echo "-a, --arango-use-ssl              Install certificates and use HTTPS for ArangoDB (default: HTTP)"
}

VALID_ARGS=$(getopt -o hd:mrfca --long 'help',directory:,repo-images,metadata-images,force,no-overwrite-certs,arango-use-ssl -- "$@")

BUILD_REPO="TRUE"
BUILD_METADATA="TRUE"
COMPOSE_ENV_DIR=""
OVERWRITE_CERTS="TRUE"
FORCE_OVERWRITE="FALSE"
ARANGO_USE_SSL="FALSE"
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -d | --directory)
    COMPOSE_ENV_DIR="$2"
    shift 2
    ;;
  -r | --repo-images)
    BUILD_METADATA="FALSE"
    shift 1
    ;;
  -m | --metadata-images)
    BUILD_REPO="FALSE"
    shift 1
    ;;
  -c | --no-overwrite-certs)
    OVERWRITE_CERTS="FALSE"
    shift 1
    ;;
  -f | --force)
    FORCE_OVERWRITE="TRUE"
    shift 1
    ;;
  -a | --arango-use-ssl)
    ARANGO_USE_SSL="TRUE"
    shift 1
    ;;
  --)
    shift
    break
    ;;
  \?) # incorrect option
    echo "ERROR - Invalid command line flag detected."
    exit
    ;;
  esac
done

if [ ! -d "${COMPOSE_ENV_DIR}" ]; then
  echo "ERROR - Invalid folder for .env file specified ${COMPOSE_ENV_DIR}"
  exit 1
fi

# Function to read existing .env file values
read_existing_env() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    echo "INFO - Reading existing values from $env_file"
    # Source the .env file to load existing values
    set -a # automatically export all variables
    source "$env_file"
    set +a # turn off automatic export
  fi
}

# Function to get value with fallback priority: existing .env -> environment -> default
get_env_value() {
  local var_name="$1"
  local default_value="$2"
  local existing_value=""

  # Get existing value from sourced .env file
  existing_value=$(eval echo "\$${var_name}")

  # Priority: existing .env value -> environment variable -> default
  if [ -n "$existing_value" ]; then
    echo "$existing_value"
  elif [ -n "$(printenv "$var_name")" ]; then
    printenv "$var_name"
  else
    echo "$default_value"
  fi
}

ENV_FILE_PATH="${COMPOSE_ENV_DIR}/.env"

# Check if .env file exists and handle accordingly
if [ -f "$ENV_FILE_PATH" ]; then
  if [ "$FORCE_OVERWRITE" = "FALSE" ]; then
    echo "INFO - Found existing .env file at $ENV_FILE_PATH"
    echo "INFO - Reading existing values and updating with any new environment variables..."
    read_existing_env "$ENV_FILE_PATH"
  else
    echo "INFO - Force overwrite enabled. Existing .env file will be replaced."
  fi
else
  echo "INFO - Creating new .env file at $ENV_FILE_PATH"
fi

local_DATAFED_KEY_DIR="${COMPOSE_ENV_DIR}/keys"
if [ ! -d "$local_DATAFED_KEY_DIR" ]; then
  mkdir -p "$local_DATAFED_KEY_DIR"
fi

# Use the new function to get values with proper fallback
local_DATAFED_DOMAIN=$(get_env_value "DATAFED_DOMAIN" "localhost")
local_DATAFED_WEB_CERT_NAME="cert.crt"
local_DATAFED_WEB_KEY_NAME="cert.key"

local_DATAFED_ARANGO_CERT_NAME="datafed-arango.crt"
local_DATAFED_ARANGO_KEY_NAME="datafed-arango.key"
local_DATAFED_ARANGO_PEM_NAME="datafed-arango.pem"

local_DATAFED_WEB_CERT_PATH=$(get_env_value "DATAFED_WEB_CERT_PATH" "${local_DATAFED_KEY_DIR}/${local_DATAFED_WEB_CERT_NAME}")
local_DATAFED_WEB_CSR_PATH=$(get_env_value "DATAFED_WEB_CSR_PATH" "${local_DATAFED_KEY_DIR}/cert.csr")
local_DATAFED_WEB_KEY_PATH=$(get_env_value "DATAFED_WEB_KEY_PATH" "${local_DATAFED_KEY_DIR}/${local_DATAFED_WEB_KEY_NAME}")
local_DATAFED_ARANGO_CERT_PATH=$(get_env_value "DATAFED_ARANGO_CERT_PATH" "")
local_DATAFED_ARANGO_CSR_PATH=$(get_env_value "DATAFED_ARANGO_CSR_PATH" "")
local_DATAFED_ARANGO_KEY_PATH=$(get_env_value "DATAFED_ARANGO_KEY_PATH" "")
local_DATAFED_ARANGO_PEM_PATH=$(get_env_value "DATAFED_ARANGO_PEM_PATH" "")

# Get all values using the new function
local_DATAFED_UID=$(get_env_value "DATAFED_UID" "$(id -u)")
local_DATAFED_USER89_PASSWORD=$(get_env_value "DATAFED_USER89_PASSWORD" "")
local_DATAFED_REPO_FORM_PATH=$(get_env_value "DATAFED_REPO_FORM_PATH" "")
local_DATAFED_GLOBUS_APP_SECRET=$(get_env_value "DATAFED_GLOBUS_APP_SECRET" "")
local_DATAFED_GLOBUS_APP_ID=$(get_env_value "DATAFED_GLOBUS_APP_ID" "")
local_DATAFED_GLOBUS_KEY_DIR=$(get_env_value "DATAFED_GLOBUS_KEY_DIR" "${COMPOSE_ENV_DIR}/globus")
local_DATAFED_ZEROMQ_SESSION_SECRET=$(get_env_value "DATAFED_ZEROMQ_SESSION_SECRET" "")
local_DATAFED_HTTPS_SERVER_PORT=$(get_env_value "DATAFED_HTTPS_SERVER_PORT" "443")
local_DATAFED_CONTAINER_LOG_PATH=$(get_env_value "DATAFED_CONTAINER_LOG_PATH" "/opt/datafed/logs")
local_DATAFED_DATABASE_PASSWORD=$(get_env_value "DATAFED_DATABASE_PASSWORD" "butterscotch")
local_DATAFED_DATABASE_IP_ADDRESS=$(get_env_value "DATAFED_DATABASE_IP_ADDRESS" "http://arango")
local_DATAFED_ENABLE_FOXX_TESTS=$(get_env_value "DATAFED_ENABLE_FOXX_TESTS" "FALSE")
local_DATAFED_DATABASE_PORT=$(get_env_value "DATAFED_DATABASE_PORT" "8529")
local_DATAFED_GCS_ROOT_NAME=$(get_env_value "DATAFED_GCS_ROOT_NAME" "DataFed_Compose")
local_DATAFED_GCS_IP=$(get_env_value "DATAFED_GCS_IP" "")
local_DATAFED_REPO_ID_AND_DIR=$(get_env_value "DATAFED_REPO_ID_AND_DIR" "datafed-repo")
local_DATAFED_HOST_COLLECTION_MOUNT=$(get_env_value "DATAFED_HOST_COLLECTION_MOUNT" "$HOME/compose_collection")
local_DATAFED_HOST_DEPLOYMENT_KEY_PATH=$(get_env_value "DATAFED_HOST_DEPLOYMENT_KEY_PATH" "${local_DATAFED_GLOBUS_KEY_DIR}/deployment-key.json")
local_DATAFED_HOST_CRED_FILE_PATH=$(get_env_value "DATAFED_HOST_CRED_FILE_PATH" "${local_DATAFED_GLOBUS_KEY_DIR}/client_cred.json")
local_DATAFED_GCS_COLLECTION_BASE_PATH=$(get_env_value "DATAFED_GCS_COLLECTION_BASE_PATH" "/")
local_DATAFED_GCS_COLLECTION_ROOT_PATH=$(get_env_value "DATAFED_GCS_COLLECTION_ROOT_PATH" "/mnt/datafed")
local_DATAFED_GLOBUS_CONTROL_PORT=$(get_env_value "DATAFED_GLOBUS_CONTROL_PORT" "443")
local_DATAFED_GLOBUS_SUBSCRIPTION=$(get_env_value "DATAFED_GLOBUS_SUBSCRIPTION" "")
local_DATAFED_CORE_LOG_LEVEL=$(get_env_value "DATAFED_CORE_LOG_LEVEL" "3")

need_web_certs="FALSE"
# Check if we need to generate certificates
if [ "$OVERWRITE_CERTS" = "TRUE" ]; then
  echo "INFO - Overwrite certs flag enabled. Regenerating SSL certificates..."
  need_web_certs="TRUE"
elif [ ! -e "$local_DATAFED_WEB_CERT_PATH" ] || [ ! -e "$local_DATAFED_WEB_KEY_PATH" ]; then
  echo "INFO - SSL certificates not found. Generating new certificates..."
  need_web_certs="TRUE"
else
  echo "INFO - Using existing SSL certificates"
fi

need_arango_certs="FALSE"
# Decide if Arango certs need to be generated
if [ "$ARANGO_USE_SSL" = "TRUE" ]; then
  if [ "$OVERWRITE_CERTS" = "TRUE" ] || [ ! -e "$local_DATAFED_ARANGO_CERT_PATH" ] || [ ! -e "$local_DATAFED_ARANGO_KEY_PATH" ]; then
      echo "INFO - Generating SSL certificates for ArangoDB..."
      need_arango_certs="TRUE"
  else
      echo "INFO - Using existing ArangoDB SSL certificates"
  fi

  [ -z "$local_DATAFED_ARANGO_CERT_PATH" ] && \
  local_DATAFED_ARANGO_CERT_PATH="${local_DATAFED_KEY_DIR}/${local_DATAFED_ARANGO_CERT_NAME}"

  [ -z "$local_DATAFED_ARANGO_CSR_PATH" ] && \
    local_DATAFED_ARANGO_CSR_PATH="${local_DATAFED_KEY_DIR}/datafed-arango.csr"

  [ -z "$local_DATAFED_ARANGO_KEY_PATH" ] && \
    local_DATAFED_ARANGO_KEY_PATH="${local_DATAFED_KEY_DIR}/${local_DATAFED_ARANGO_KEY_NAME}"

  [ -z "$local_DATAFED_ARANGO_PEM_PATH" ] && \
    local_DATAFED_ARANGO_PEM_PATH="${local_DATAFED_KEY_DIR}/${local_DATAFED_ARANGO_PEM_NAME}"

  if [ "$local_DATAFED_DATABASE_IP_ADDRESS" == "http://arango" ]; then
    echo "WARNING - Switching http://arango to https://arango"
    local_DATAFED_DATABASE_IP_ADDRESS="https://arango"
  fi
else
  found_arango_certs="FALSE"
  for file in \
    "${local_DATAFED_KEY_DIR}/${local_DATAFED_ARANGO_KEY_NAME}" \
    "${local_DATAFED_KEY_DIR}/${local_DATAFED_ARANGO_PEM_NAME}" \
    "${local_DATAFED_KEY_DIR}/${local_DATAFED_ARANGO_CERT_NAME}"; do
      [ -f "$file" ] && found_arango_certs="TRUE"
  done

  if [ "$found_arango_certs" == "TRUE" ]; then
    echo "WARNING - Found arango certificate files in ${local_DATAFED_KEY_DIR}"
    echo "          if you do not intend to build with https they will need to be removed!"
  fi
fi

if [ "$need_web_certs" = "TRUE" ]; then
  for file in \
    "$local_DATAFED_WEB_CERT_PATH" \
    "$local_DATAFED_WEB_KEY_PATH" \
    "$local_DATAFED_WEB_CSR_PATH"; do
      [ -e "$file" ] && rm "$file"
  done

  openssl genrsa -out "$local_DATAFED_WEB_KEY_PATH" 2048
  openssl req -new -key "$local_DATAFED_WEB_KEY_PATH" \
    -out "${local_DATAFED_WEB_CSR_PATH}" \
    -subj "/C=US/ST=TN/L=DataFed/O=DataFed/OU=DataFed/CN=${local_DATAFED_DOMAIN}"
  openssl x509 -req -days 3650 \
    -in "${local_DATAFED_WEB_CSR_PATH}" \
    -signkey "$local_DATAFED_WEB_KEY_PATH" \
    -out "$local_DATAFED_WEB_CERT_PATH"
fi

if [ "$need_arango_certs" = "TRUE" ]; then
  for file in \
    "$local_DATAFED_ARANGO_CERT_PATH" \
    "$local_DATAFED_ARANGO_KEY_PATH" \
    "$local_DATAFED_ARANGO_CSR_PATH" \
    "$local_DATAFED_ARANGO_PEM_PATH"; do
      [ -e "$file" ] && rm "$file"
  done

  openssl genrsa -out "$local_DATAFED_ARANGO_KEY_PATH" 2048
  openssl req -new -key "$local_DATAFED_ARANGO_KEY_PATH" \
    -out "${local_DATAFED_ARANGO_CSR_PATH}" \
    -subj "/C=US/ST=TN/L=DataFed/O=DataFed/OU=DataFed/CN=arango"
  openssl x509 -req -days 3650 \
    -in "${local_DATAFED_ARANGO_CSR_PATH}" \
    -signkey "$local_DATAFED_ARANGO_KEY_PATH" \
    -out "$local_DATAFED_ARANGO_CERT_PATH"

  cat "$local_DATAFED_ARANGO_CERT_PATH" "$local_DATAFED_ARANGO_KEY_PATH" > "$local_DATAFED_ARANGO_PEM_PATH"
fi

if [ -f "${local_DATAFED_ARANGO_CERT_PATH}" ]; then
  if [ ${local_DATAFED_DATABASE_IP_ADDRESS} == "http://arango" ]; then
    echo "WARNING - Discovered that Arango is set to use certificate: $local_DATAFED_ARANGO_CERT_PATH"
    echo "          switching DATAFED_DATABASE_IP_ADDRESS from http://arango to https://arango"
    local_DATAFED_DATABASE_IP_ADDRESS="https://arango"
  fi
else
  if [ ${local_DATAFED_DATABASE_IP_ADDRESS} == "https://arango" ]; then
    echo "WARNING - Discovered that Arango certs are not defined."
    echo "          switching DATAFED_DATABASE_IP_ADDRESS from https://arango to http://arango"
    local_DATAFED_DATABASE_IP_ADDRESS="http://arango"
  fi
fi

# Handle repo domain logic
if [ -z "$(get_env_value "DATAFED_REPO_DOMAIN" "")" ]; then
  if [ "${local_DATAFED_DOMAIN}" = "localhost" ]; then
    local_DATAFED_REPO_DOMAIN=""
  else
    local_DATAFED_REPO_DOMAIN="${local_DATAFED_DOMAIN}"
  fi
else
  local_DATAFED_REPO_DOMAIN=$(get_env_value "DATAFED_REPO_DOMAIN" "")
fi

# Make the logs folder if it doesn't exist
mkdir -p "${COMPOSE_ENV_DIR}/logs"

# Remove existing .env file
if [ -f "$ENV_FILE_PATH" ]; then
  rm "$ENV_FILE_PATH"
fi

touch "$ENV_FILE_PATH"
# Do not put " around anything and do not add comments in the .env file

if [ "${BUILD_METADATA}" == "TRUE" ] || [ "${BUILD_REPO}" == "TRUE" ]; then

  cat <<EOF >>"$ENV_FILE_PATH"
DATAFED_HTTPS_SERVER_PORT=${local_DATAFED_HTTPS_SERVER_PORT}
DATAFED_DOMAIN=${local_DATAFED_DOMAIN}
DATAFED_UID=${local_DATAFED_UID}
DATAFED_CONTAINER_LOG_PATH=${local_DATAFED_CONTAINER_LOG_PATH}
DATAFED_CORE_LOG_LEVEL=${local_DATAFED_CORE_LOG_LEVEL}
EOF
fi

if [ "${BUILD_METADATA}" == "TRUE" ]; then
  cat <<EOF >>"$ENV_FILE_PATH"
DATAFED_GLOBUS_APP_SECRET=${local_DATAFED_GLOBUS_APP_SECRET}
DATAFED_GLOBUS_APP_ID=${local_DATAFED_GLOBUS_APP_ID}
DATAFED_ZEROMQ_SESSION_SECRET=${local_DATAFED_ZEROMQ_SESSION_SECRET}
DATAFED_WEB_CERT_PATH=${local_DATAFED_WEB_CERT_PATH}
DATAFED_WEB_KEY_PATH=${local_DATAFED_WEB_KEY_PATH}
DATAFED_ARANGO_CERT_PATH=${local_DATAFED_ARANGO_CERT_PATH}
DATAFED_ARANGO_KEY_PATH=${local_DATAFED_ARANGO_KEY_PATH}
DATAFED_ARANGO_PEM_PATH=${local_DATAFED_ARANGO_PEM_PATH}
DATAFED_DATABASE_PASSWORD=${local_DATAFED_DATABASE_PASSWORD}
DATAFED_DATABASE_IP_ADDRESS=${local_DATAFED_DATABASE_IP_ADDRESS}
DATAFED_DATABASE_PORT=${local_DATAFED_DATABASE_PORT}
DATAFED_ENABLE_FOXX_TESTS=${local_DATAFED_ENABLE_FOXX_TESTS}
EOF
fi

if [ "${BUILD_REPO}" == "TRUE" ]; then
  cat <<EOF >>"$ENV_FILE_PATH"
DATAFED_GCS_ROOT_NAME=${local_DATAFED_GCS_ROOT_NAME}
DATAFED_GCS_IP=${local_DATAFED_GCS_IP}
DATAFED_REPO_ID_AND_DIR=${local_DATAFED_REPO_ID_AND_DIR}
DATAFED_HOST_COLLECTION_MOUNT=${local_DATAFED_HOST_COLLECTION_MOUNT}
DATAFED_HOST_DEPLOYMENT_KEY_PATH=${local_DATAFED_HOST_DEPLOYMENT_KEY_PATH}
DATAFED_HOST_CRED_FILE_PATH=${local_DATAFED_HOST_CRED_FILE_PATH}
DATAFED_GLOBUS_CONTROL_PORT=${local_DATAFED_GLOBUS_CONTROL_PORT}
DATAFED_GLOBUS_SUBSCRIPTION=${local_DATAFED_GLOBUS_SUBSCRIPTION}
DATAFED_REPO_DOMAIN=${local_DATAFED_REPO_DOMAIN}
DATAFED_GCS_COLLECTION_BASE_PATH=${local_DATAFED_GCS_COLLECTION_BASE_PATH}
DATAFED_GCS_COLLECTION_ROOT_PATH=${local_DATAFED_GCS_COLLECTION_ROOT_PATH}
EOF
fi

unset_env_file_name="${COMPOSE_ENV_DIR}/unset_env.sh"
echo "#!/bin/bash" >"${unset_env_file_name}"
echo "# Was auto generated by $SCRIPT" >>"${unset_env_file_name}"
while IFS='=' read -r key value; do
  # Check if the line contains the '=' sign
  if [ -n "$value" ]; then
    # Print the content before the '=' sign
    echo "unset $key" >>"${unset_env_file_name}"
  fi
done <"$ENV_FILE_PATH"

chmod +x "$unset_env_file_name"

echo "INFO - Successfully created/updated .env file at: $ENV_FILE_PATH"
