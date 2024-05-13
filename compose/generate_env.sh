#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

if [ -f ".env" ]
then
  echo ".env already exist! Will not overwrite!"
  exit 1
fi

local_DATAFED_WEB_KEY_DIR="${PROJECT_ROOT}/compose/keys"
if [ ! -d "$local_DATAFED_WEB_KEY_DIR" ]
then
  mkdir -p "$local_DATAFED_WEB_KEY_DIR"
fi

if [ -z "${DATAFED_COMPOSE_DOMAIN}" ]
then
  local_DATAFED_COMPOSE_DOMAIN="localhost"
else
  local_DATAFED_COMPOSE_DOMAIN=$(printenv DATAFED_COMPOSE_DOMAIN)
fi

local_DATAFED_WEB_CERT_NAME="cert.crt"
local_DATAFED_WEB_KEY_NAME="cert.key"

local_DATAFED_WEB_CERT_PATH="${local_DATAFED_WEB_KEY_DIR}/${local_DATAFED_WEB_CERT_NAME}"
local_DATAFED_WEB_CSR_PATH="${local_DATAFED_WEB_KEY_DIR}/cert.csr"
local_DATAFED_WEB_KEY_PATH="${local_DATAFED_WEB_KEY_DIR}/${local_DATAFED_WEB_KEY_NAME}"

if [ ! -e "$local_DATAFED_WEB_CERT_PATH" ] || [ ! -e "$local_DATAFED_WEB_KEY_PATH" ]
then
  if [ -e "$local_DATAFED_WEB_CERT_PATH" ]
  then
    rm "${local_DATAFED_WEB_CERT_PATH}"
  fi
  if [ -e "$local_DATAFED_WEB_KEY_PATH" ]
  then
    rm "${local_DATAFED_WEB_KEY_PATH}"
  fi
  if [ -e "$local_DATAFED_WEB_CSR_PATH" ]
  then
    rm "${local_DATAFED_WEB_CSR_PATH}"
  fi
  openssl genrsa -out "$local_DATAFED_WEB_KEY_PATH" 2048
  openssl req -new -key "$local_DATAFED_WEB_KEY_PATH" \
    -out "${local_DATAFED_WEB_CSR_PATH}" \
    -subj "/C=US/ST=TN/L=Oak Ridge/O=ORNL/OU=DLT/CN=${local_DATAFED_COMPOSE_DOMAIN}"
  openssl x509 -req -days 3650 \
     -in "${local_DATAFED_WEB_CSR_PATH}" \
     -signkey "$local_DATAFED_WEB_KEY_PATH" \
     -out "$local_DATAFED_WEB_CERT_PATH"
fi

if [ -z "${DATAFED_COMPOSE_USER89_PASSWORD}" ]
then
  local_DATAFED_COMPOSE_USER89_PASSWORD="" # For End to end testing
else
  local_DATAFED_COMPOSE_USER89_PASSWORD=$(printenv DATAFED_COMPOSE_USER89_PASSWORD)
fi
if [ -z "${DATAFED_COMPOSE_REPO_FORM_PATH}" ]
then
  local_DATAFED_COMPOSE_REPO_FORM_PATH="" # Where the repo form is located also needed for testing
else
  local_DATAFED_COMPOSE_REPO_FORM_PATH=$(printenv DATAFED_COMPOSE_REPO_FORM_PATH)
fi
if [ -z "${DATAFED_COMPOSE_GLOBUS_APP_SECRET}" ]
then
  local_DATAFED_COMPOSE_GLOBUS_APP_SECRET=""
else
  local_DATAFED_COMPOSE_GLOBUS_APP_SECRET=$(printenv DATAFED_COMPOSE_GLOBUS_APP_SECRET)
fi
if [ -z "${DATAFED_COMPOSE_GLOBUS_APP_ID}" ]
then
  local_DATAFED_COMPOSE_GLOBUS_APP_ID=""
else
  local_DATAFED_COMPOSE_GLOBUS_APP_ID=$(printenv DATAFED_COMPOSE_GLOBUS_APP_ID)
fi
if [ -z "${DATAFED_GLOBUS_KEY_DIR}" ]
then
  local_DATAFED_GLOBUS_KEY_DIR="${PROJECT_ROOT}/compose/globus"
else
  local_DATAFED_GLOBUS_KEY_DIR=$(printenv DATAFED_GLOBUS_KEY_DIR)
fi
if [ -z "${DATAFED_COMPOSE_ZEROMQ_SESSION_SECRET}" ]
then
  local_DATAFED_COMPOSE_ZEROMQ_SESSION_SECRET=""
else
  local_DATAFED_COMPOSE_ZEROMQ_SESSION_SECRET=$(printenv DATAFED_COMPOSE_ZEROMQ_SESSION_SECRET)
fi
if [ -z "${DATAFED_COMPOSE_ZEROMQ_SYSTEM_SECRET}" ]
then
  local_DATAFED_COMPOSE_ZEROMQ_SYSTEM_SECRET=""
else
  local_DATAFED_COMPOSE_ZEROMQ_SYSTEM_SECRET=$(printenv DATAFED_COMPOSE_ZEROMQ_SYSTEM_SECRET)
fi
if [ -z "${DATAFED_COMPOSE_HTTPS_SERVER_PORT}" ]
then
  local_DATAFED_COMPOSE_HTTPS_SERVER_PORT="443"
else
  local_DATAFED_COMPOSE_HTTPS_SERVER_PORT=$(printenv DATAFED_COMPOSE_HTTPS_SERVER_PORT)
fi
if [ -z "${DATAFED_COMPOSE_CONTAINER_LOG_PATH}" ]
then
  local_DATAFED_COMPOSE_CONTAINER_LOG_PATH="/opt/datafed/logs"
else
  local_DATAFED_COMPOSE_CONTAINER_LOG_PATH=$(printenv DATAFED_COMPOSE_CONTAINER_LOG_PATH)
fi
if [ -z "${DATAFED_COMPOSE_DATABASE_PASSWORD}" ]
then
  local_DATAFED_COMPOSE_DATABASE_PASSWORD="butterscotch"
else
  local_DATAFED_COMPOSE_DATABASE_PASSWORD=$(printenv DATAFED_COMPOSE_DATABASE_PASSWORD)
fi

if [ -z "${DATAFED_COMPOSE_DATABASE_IP_ADDRESS}" ]
then
  local_DATAFED_COMPOSE_DATABASE_IP_ADDRESS="http://arango"
else
  local_DATAFED_COMPOSE_DATABASE_IP_ADDRESS=$(printenv DATAFED_COMPOSE_DATABASE_IP_ADDRESS)
fi

if [ -z "${DATAFED_COMPOSE_DATABASE_PORT}" ]
then
  local_DATAFED_COMPOSE_DATABASE_PORT="8529"
else
  local_DATAFED_COMPOSE_DATABASE_PORT=$(printenv DATAFED_COMPOSE_DATABASE_PORT)
fi

if [ -z "${DATAFED_COMPOSE_HOST_COLLECTION_MOUNT}" ]
then
  local_DATAFED_HOST_COLLECTION_MOUNT="$HOME/compose_collection"
else
  local_DATAFED_HOST_COLLECTION_MOUNT=$(printenv DATAFED_COMPOSE_HOST_COLLECTION_MOUNT)
fi

if [ -z "${DATAFED_COMPOSE_HOST_DEPLOYMENT_KEY_PATH}" ]
then
  local_DATAFED_COMPOSE_HOST_DEPLOYMENT_KEY_PATH="${local_DATAFED_GLOBUS_KEY_DIR}/deployment-key.json"
else
  local_DATAFED_COMPOSE_HOST_DEPLOYMENT_KEY_PATH=$(printenv DATAFED_COMPOSE_HOST_DEPLOYMENT_KEY_PATH)
fi

if [ -z "${DATAFED_COMPOSE_HOST_CRED_FILE_PATH}" ]
then
  local_DATAFED_HOST_CRED_FILE_PATH="${local_DATAFED_GLOBUS_KEY_DIR}/client_cred.json"
else
  local_DATAFED_HOST_CRED_FILE_PATH=$(printenv DATAFED_COMPOSE_HOST_CRED_FILE_PATH)
fi

if [ -z "${DATAFED_GLOBUS_CONTROL_PORT}" ]
then
  # For compose will set by default to run on a port other than 443 because 
  # the core metadata services use 443 for the web server 7510
  local_DATAFED_GLOBUS_CONTROL_PORT="443"
else
  local_DATAFED_GLOBUS_CONTROL_PORT=$(printenv DATAFED_GLOBUS_CONTROL_PORT)
fi

if [ -z "${DATAFED_GLOBUS_SUBSCRIPTION}" ]
then
  # For compose will set by default to run on a port other than 443 because 
  # the core metadata services use 443 for the web server
  local_DATAFED_GLOBUS_SUBSCRIPTION=""
else
  local_DATAFED_GLOBUS_SUBSCRIPTION=$(printenv DATAFED_GLOBUS_SUBSCRIPTION)
fi


# Make the logs folder if it doesn't exist
mkdir -p "${PROJECT_ROOT}/compose/logs"

# Do not put " around anything and do not add comments in the .env file
cat << EOF > ".env"
DATAFED_REPO_USER=datafed
DATAFED_USER89_PASSWORD=${local_DATAFED_COMPOSE_USER89_PASSWORD}
DATAFED_REPO_FORM_PATH=${local_DATAFED_COMPOSE_REPO_FORM_PATH}
DATAFED_GLOBUS_APP_SECRET=${local_DATAFED_COMPOSE_GLOBUS_APP_SECRET}
DATAFED_GLOBUS_APP_ID=${local_DATAFED_COMPOSE_GLOBUS_APP_ID}
DATAFED_ZEROMQ_SESSION_SECRET=${local_DATAFED_COMPOSE_ZEROMQ_SESSION_SECRET}
DATAFED_ZEROMQ_SYSTEM_SECRET=${local_DATAFED_COMPOSE_ZEROMQ_SYSTEM_SECRET}
DATAFED_DOMAIN=${local_DATAFED_COMPOSE_DOMAIN}
DATAFED_HTTPS_SERVER_PORT=${local_DATAFED_COMPOSE_HTTPS_SERVER_PORT}
DATAFED_WEB_CERT_PATH=/opt/datafed/keys/${local_DATAFED_WEB_CERT_NAME}
DATAFED_WEB_KEY_PATH=/opt/datafed/keys/${local_DATAFED_WEB_KEY_NAME}
DATAFED_CONTAINER_LOG_PATH=${local_DATAFED_COMPOSE_CONTAINER_LOG_PATH}
DATAFED_DATABASE_PASSWORD=${local_DATAFED_COMPOSE_DATABASE_PASSWORD}
DATAFED_DATABASE_IP_ADDRESS=${local_DATAFED_COMPOSE_DATABASE_IP_ADDRESS}
DATAFED_DATABASE_PORT=${local_DATAFED_COMPOSE_DATABASE_PORT}
DATAFED_GCS_ROOT_NAME=DataFed_Compose
DATAFED_REPO_ID_AND_DIR=compose-home
DATAFED_UID=$(id -u)
DATAFED_HOST_COLLECTION_MOUNT=${local_DATAFED_HOST_COLLECTION_MOUNT}
DATAFED_HOST_DEPLOYMENT_KEY_PATH=${local_DATAFED_COMPOSE_HOST_DEPLOYMENT_KEY_PATH}
DATAFED_HOST_CRED_FILE_PATH=${local_DATAFED_HOST_CRED_FILE_PATH}
DATAFED_GLOBUS_CONTROL_PORT=${local_DATAFED_GLOBUS_CONTROL_PORT}
DATAFED_GLOBUS_SUBSCRIPTION=${local_DATAFED_GLOBUS_SUBSCRIPTION}
EOF

unset_env_file_name="unset_env.sh"
echo "#!/bin/bash" > "${unset_env_file_name}"
echo "# Was auto generated by $SCRIPT" >> "${unset_env_file_name}"
while IFS='=' read -r key value; do
    # Check if the line contains the '=' sign
    if [ -n "$value" ]; then
        # Print the content before the '=' sign
        echo "unset $key" >> "${unset_env_file_name}"
    fi
done < ".env"

chmod +x "$unset_env_file_name"
