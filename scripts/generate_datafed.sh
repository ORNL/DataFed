#!/bin/env bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

CONFIG_FILE_NAME="datafed.sh"
PATH_TO_CONFIG_DIR=$(realpath "$SOURCE/../config")

local_DATAFED_DEFAULT_LOG_PATH=""
if [ -z "${DATAFED_DEFAULT_LOG_PATH}" ]
then
  local_DATAFED_DEFAULT_LOG_PATH=""
else
  local_DATAFED_DEFAULT_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

local_DATAFED_DATABASE_PASSWORD=""
if [ -z "${DATAFED_DATABASE_PASSWORD}" ]
then
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

local_DATAFED_ZEROMQ_SESSION_SECRET=""
if [ -z "${DATAFED_ZEROMQ_SESSION_SECRET}" ]
then
  local_DATAFED_ZEROMQ_SESSION_SECRET=""
else
  local_DATAFED_ZEROMQ_SESSION_SECRET=$(printenv DATAFED_ZEROMQ_SESSION_SECRET)
fi

local_DATAFED_ZEROMQ_SYSTEM_SECRET=""
if [ -z "${DATAFED_ZEROMQ_SYSTEM_SECRET}" ]
then
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=""
else
  local_DATAFED_ZEROMQ_SYSTEM_SECRET=$(printenv DATAFED_ZEROMQ_SYSTEM_SECRET)
fi

local_DATAFED_LEGO_EMAIL=""
if [ -z "${DATAFED_LEGO_EMAIL}" ]
then
  local_DATAFED_LEGO_EMAIL=""
else
  local_DATAFED_LOG_PATH=$(printenv DATAFED_LEGO_EMAIL)
fi

local_DATAFED_GLOBUS_APP_ID=""
if [ -z "${DATAFED_GLOBUS_APP_ID}" ]
then
  local_DATAFED_GLOBUS_APP_ID=""
else
  local_DATAFED_GLOBUS_APP_ID=$(printenv DATAFED_GLOBUS_APP_ID)
fi

local_DATAFED_GLOBUS_APP_SECRET=""
if [ -z "${DATAFED_GLOBUS_APP_SECRET}" ]
then
  local_DATAFED_GLOBUS_APP_SECRET=""
else
  local_DATAFED_GLOBUS_APP_SECRET=$(printenv DATAFED_GLOBUS_APP_SECRET)
fi

local_DATAFED_SERVER_DOMAIN_NAME_AND_PORT=""
if [ -z "${DATAFED_SERVER_DOMAIN_NAME_AND_PORT}" ]
then
  local_DATAFED_SERVER_DOMAIN_NAME_AND_PORT=""
else
  local_DATAFED_SERVER_DOMAIN_NAME_AND_PORT=$(printenv DATAFED_SERVER_DOMAIN_NAME_AND_PORT)
fi

local_DATAFED_DOMAIN=""
if [ -z "${DATAFED_DOMAIN}" ]
then
  local_DATAFED_DOMAIN=""
else
  local_DATAFED_DOMAIN=$(printenv DATAFED_DOMAIN)
fi

local_DATAFED_GCS_ROOT_NAME=""
if [ -z "${DATAFED_GCS_ROOT_NAME}" ]
then
  local_DATAFED_GCS_ROOT_NAME=""
else
  local_DATAFED_GCS_ROOT_NAME=$(printenv DATAFED_GCS_ROOT_NAME)
fi

local_DATAFED_GCS_COLLECTION_ROOT_PATH=""
if [ -z "${DATAFED_GCS_COLLECTION_ROOT_PATH}" ]
then
  local_DATAFED_GCS_COLLECTION_ROOT_PATH=""
else
  local_DATAFED_GCS_COLLECTION_ROOT_PATH=$(printenv DATAFED_GCS_COLLECTION_ROOT_PATH)
fi

local_DATAFED_REPO_ID_AND_DIR=""
if [ -z "${DATAFED_REPO_ID_AND_DIR}" ]
then
  local_DATAFED_REPO_ID_AND_DIR=""
else
  local_DATAFED_REPO_ID_AND_DIR=$(printenv DATAFED_REPO_ID_AND_DIR)
fi

cat << EOF > "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
# This is the master DataFed configuration file

export DATAFED_DEFAULT_LOG_PATH="$local_DATAFED_DEFAULT_LOG_PATH"

# ************************************************
# Env Variables for Core Server
# ************************************************
export DATABASE_PASSWORD="$local_DATAFED_DATABASE_PASSWORD"

# ************************************************
# Env Variables for Web Server
# ************************************************
export DATAFED_ZEROMQ_SESSION_SECRET="$local_DATAFED_ZEROMQ_SESSION_SECRET"
export DATAFED_ZEROMQ_SYSTEM_SECRET="$local_DATAFED_ZEROMQ_SYSTEM_SECRET"
# An email address is required by LEGO when 
# requesting certificates for the domain
export DATAFED_LEGO_EMAIL="$local_DATAFED_LEGO_EMAIL"

# ************************************************
# Env Variables for Core & Web Server
# ************************************************
export DATAFED_GLOBUS_APP_ID="$local_DATAFED_GLOBUS_APP_ID"
export DATAFED_GLOBUS_APP_SECRET="$local_DATAFED_GLOBUS_APP_SECRET"

# ************************************************
# Env Variables for Repo Server
# ************************************************
# i.e. datafed-server-test.ornl.gov:7512
export DATAFED_SERVER_DOMAIN_NAME_AND_PORT="$local_DATAFED_SERVER_DOMAIN_NAME_AND_PORT"

# ************************************************
# Env Variables for Authz, Web, Repo Server
# ************************************************
# If not set will resolve to datafed.ornl.gov
export DATAFED_DOMAIN="$local_DATAFED_DOMAIN"

# ************************************************
# Env Variables for Globus Connect Server
# ************************************************
# The root display name used when setting up the
# DataFed components of the Globus Connect Server
#
# i.e. DATAFED_GCS_ROOT_NAME="CADES GCS Test"
#
# This will be used to define the following items
# 
# DATAFED_GCS_COLLECTION_MAPPED="\$DATAFED_GCS_ROOT_NAME Collection Mapped"
# DATAFED_GCS_STORAGE_GATEWAY="\$DATAFED_GCS_ROOT_NAME Storage Gateway"
# 
# So using the example above these would be defined as:
#
# DATAFED_GCS_COLLECTION_MAPPED="CADES GCS Test Collection Mapped"
# DATAFED_GCS_STORAGE_GATEWAY="CADES GCS Test Storage Gateway"
export DATAFED_GCS_ROOT_NAME="$local_DATAFED_GCS_ROOT_NAME"
# The POSIX path to the Globus GUEST collection.
#
# i.e. /home/cades/collections/mapped
#
# The path will be created if it does not exist
# 
# \$GCS_COLLECTION_ROOT_PATH/\$DATAFED_ROOT_NAME"
#
# So if these variables are defined as:
# DATAFED_GCS_ROOT_NAME="datafed-home"
# GCS_COLLECTION_ROOT_PATH="/home/cades/collections/mapped/"
# 
# A folder named 
#
# "/home/cades/collections/mapped/datafed-home"
#
# Will be created
export GCS_COLLECTION_ROOT_PATH="$local_DATAFED_GCS_COLLECTION_ROOT_PATH"
# The DataFed repo id, this also must be the name
# of the directory that will be placed in Globus 
# collection, avoid using spaces in the name.
# i.e. DATAFED_REPO_ID_AND_DIR="datafed-home"
export DATAFED_REPO_ID_AND_DIR="$local_DATAFED_REPO_ID_AND_DIR"
EOF
