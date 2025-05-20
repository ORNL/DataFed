#!/bin/bash

set -ef -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

CONFIG_FILE_NAME="datafed.sh"
PATH_TO_CONFIG_DIR=$(realpath "$PROJECT_ROOT/config")

# This is a build config variable
local_DATAFED_INSTALL_PATH=""
if [ -z "${DATAFED_INSTALL_PATH}" ]
then
  local_DATAFED_INSTALL_PATH="/opt/datafed"
else
  local_DATAFED_INSTALL_PATH=$(printenv DATAFED_INSTALL_PATH)
fi

# This is a build config variable
local_DATAFED_DEPENDENCIES_INSTALL_PATH=""

if [ -z "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]
then
  local_DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"
else
  local_DATAFED_DEPENDENCIES_INSTALL_PATH=$(printenv DATAFED_DEPENDENCIES_INSTALL_PATH)
fi

local_DATAFED_DEFAULT_LOG_PATH=""
if [ -z "${DATAFED_DEFAULT_LOG_PATH}" ]
then
  local_DATAFED_DEFAULT_LOG_PATH="/var/log/datafed"
else
  local_DATAFED_DEFAULT_LOG_PATH=$(printenv DATAFED_DEFAULT_LOG_PATH)
fi

local_DATAFED_DATABASE_PASSWORD=""
if [[ ! -v DATAFED_DATABASE_PASSWORD ]]
then
  # Not set
  local_DATAFED_DATABASE_PASSWORD=""
elif [[ -z "$DATAFED_DATABASE_PASSWORD" ]]
then
  # Empty
  local_DATAFED_DATABASE_PASSWORD=""
else
  local_DATAFED_DATABASE_PASSWORD=$(printenv DATAFED_DATABASE_PASSWORD)
fi

local_DATAFED_DATABASE_HOST=""
if [[ -z "$DATAFED_DATABASE_HOST" ]]
then
  # Empty
  local_DATAFED_DATABASE_HOST="localhost"
else
  local_DATAFED_DATABASE_HOST=$(printenv DATAFED_DATABASE_HOST)
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
  local_DATAFED_LEGO_EMAIL=$(printenv DATAFED_LEGO_EMAIL)
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

local_DATAFED_SERVER_PORT=""
if [ -z "${DATAFED_SERVER_PORT}" ]
then
  local_DATAFED_SERVER_PORT="7512"
else
  local_DATAFED_SERVER_PORT=$(printenv DATAFED_SERVER_PORT)
fi

local_DATAFED_DOMAIN=""
if [ -z "${DATAFED_DOMAIN}" ]
then
  local_DATAFED_DOMAIN="datafed.ornl.gov"
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

local_DATAFED_GCS_COLLECTION_BASE_PATH=""
if [ -z "${DATAFED_GCS_COLLECTION_BASE_PATH}" ]
then
  local_DATAFED_GCS_COLLECTION_BASE_PATH=""
else
  local_DATAFED_GCS_COLLECTION_BASE_PATH=$(printenv DATAFED_GCS_COLLECTION_BASE_PATH)
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

local_DATAFED_WEB_CERT_PATH=""
if [ -z "${DATAFED_WEB_CERT_PATH}" ]
then
local_DATAFED_WEB_CERT_PATH="${local_DATAFED_INSTALL_PATH}/keys/${local_DATAFED_DOMAIN}.crt"
else
  local_DATAFED_WEB_CERT_PATH=$(printenv DATAFED_WEB_CERT_PATH)
fi

local_DATAFED_WEB_KEY_PATH=""
if [ -z "${DATAFED_WEB_KEY_PATH}" ]
then
  local_DATAFED_WEB_KEY_PATH="${local_DATAFED_INSTALL_PATH}/keys/${local_DATAFED_DOMAIN}.key"
else
  local_DATAFED_WEB_KEY_PATH=$(printenv DATAFED_WEB_KEY_PATH)
fi

if [ -z "${DATAFED_CORE_ADDRESS_PORT_INTERNAL}" ]
then
  local_DATAFED_CORE_ADDRESS_PORT_INTERNAL="${local_DATAFED_DOMAIN}:7513"
else
  local_DATAFED_CORE_ADDRESS_PORT_INTERNAL=$(printenv DATAFED_CORE_ADDRESS_PORT_INTERNAL)
fi

if [ -z "${DATAFED_GOOGLE_ANALYTICS_TAG}" ]
then
  local_DATAFED_GOOGLE_ANALYTICS_TAG=""
else
  local_DATAFED_GOOGLE_ANALYTICS_TAG=$(printenv DATAFED_GOOGLE_ANALYTICS_TAG)
fi

if [ -z "${DATAFED_GLOBUS_REPO_USER}" ]
then
  local_DATAFED_GLOBUS_REPO_USER=""
else
  local_DATAFED_GLOBUS_REPO_USER=$(printenv DATAFED_GLOBUS_REPO_USER)
fi

if [ -z "${DATAFED_CORE_USER}" ]
then
  local_DATAFED_CORE_USER=""
else
  local_DATAFED_CORE_USER=$(printenv DATAFED_CORE_USER)
fi


if [ -z "${DATAFED_GLOBUS_CONTROL_PORT}" ]
then
  local_DATAFED_GLOBUS_CONTROL_PORT="443"
else
  local_DATAFED_GLOBUS_CONTROL_PORT=$(printenv DATAFED_GLOBUS_CONTROL_PORT)
fi

if [ -z "${DATAFED_GLOBUS_ALLOWED_DOMAINS}" ]
then
  local_DATAFED_GLOBUS_ALLOWED_DOMAINS="globusid.org"
else
  local_DATAFED_GLOBUS_ALLOWED_DOMAINS=$(printenv DATAFED_GLOBUS_ALLOWED_DOMAINS)
fi

if [ -z "${DATAFED_GLOBUS_SUBSCRIPTION}" ]
then
  # For compose will set by default to run on a port other than 443 because
  # the core metadata services use 443 for the web server
  local_DATAFED_GLOBUS_SUBSCRIPTION=""
else
  local_DATAFED_GLOBUS_SUBSCRIPTION=$(printenv DATAFED_GLOBUS_SUBSCRIPTION)
fi

if [ ! -d "$PATH_TO_CONFIG_DIR" ]
then
  mkdir -p "$PATH_TO_CONFIG_DIR"
fi

if [ ! -f  "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}" ]
then
  touch "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
fi

cat << EOF > "$PATH_TO_CONFIG_DIR/${CONFIG_FILE_NAME}"
# This is the master DataFed configuration file

# This is used when generating the service files to determine
# where the log files will be output.
# If left unspecified the default location is
# /var/log/datafed
export DATAFED_DEFAULT_LOG_PATH="$local_DATAFED_DEFAULT_LOG_PATH"
# This is the folder where datafed will be installed
# by default it will install to:
# /opt/datafed
export DATAFED_INSTALL_PATH="$local_DATAFED_INSTALL_PATH"
# This is the folder where datafed dependencies will be installed
# by default it will install to:
# /opt/datafed/dependencies
export DATAFED_DEPENDENCIES_INSTALL_PATH="$local_DATAFED_DEPENDENCIES_INSTALL_PATH"
export DATAFED_PYTHON_DEPENDENCIES_DIR="${local_DATAFED_DEPENDENCIES_INSTALL_PATH}/python"
export DATAFED_PYTHON_ENV="${local_DATAFED_DEPENDENCIES_INSTALL_PATH}/python/datafed"
# ************************************************
# Env Variables for Core & Web Server
# ************************************************
export DATAFED_GLOBUS_APP_ID="$local_DATAFED_GLOBUS_APP_ID"
export DATAFED_GLOBUS_APP_SECRET="$local_DATAFED_GLOBUS_APP_SECRET"

# ************************************************
# Env Variables for Repo Server
# ************************************************
# i.e. 7512 - ZeroMQ port
export DATAFED_SERVER_PORT="$local_DATAFED_SERVER_PORT"

# ************************************************
# Env Variables for Authz, Web, Repo Server
# ************************************************
# DataFed Repository POSIX user account that DataFed users will be mapped too
# from Globus, so the posix account all globus users will map too
export DATAFED_GLOBUS_REPO_USER="$local_DATAFED_GLOBUS_REPO_USER"

# ******************************************************************
# Env Variables for Authz, Web, Repo Server & administrative scripts
# ******************************************************************
# If not set will resolve to datafed.ornl.gov
export DATAFED_DOMAIN="$local_DATAFED_DOMAIN"

# ************************************************
# Env Variables for Core Server
# ************************************************
export DATAFED_DATABASE_PASSWORD="$local_DATAFED_DATABASE_PASSWORD"
# Host of the metadata database, can be a domain name
# or an IP address.
export DATAFED_DATABASE_HOST="$local_DATAFED_DATABASE_HOST"
# The user account the datafed core application will run under
export DATAFED_CORE_USER="$local_DATAFED_CORE_USER"

# ************************************************
# Env Variables for Web Server
# ************************************************
export DATAFED_ZEROMQ_SESSION_SECRET="$local_DATAFED_ZEROMQ_SESSION_SECRET"
export DATAFED_ZEROMQ_SYSTEM_SECRET="$local_DATAFED_ZEROMQ_SYSTEM_SECRET"
# An email address is required by LEGO when
# requesting certificates for the domain
export DATAFED_LEGO_EMAIL="$local_DATAFED_LEGO_EMAIL"
# Path to the private key - needed for https
export DATAFED_WEB_KEY_PATH="$local_DATAFED_WEB_KEY_PATH"
# Path to the certificate - needed for https
export DATAFED_WEB_CERT_PATH="$local_DATAFED_WEB_CERT_PATH"
# The user account the datafed web application will run under
export DATAFED_WEB_USER=""
# How the web server communicates with the core server, assumes an internal network
export DATAFED_CORE_ADDRESS_PORT_INTERNAL="$local_DATAFED_CORE_ADDRESS_PORT_INTERNAL"
# The id for the associated Google Analytics tag, if left empty, Google Analytics will be disabled
# You can find your tag id by going to the stream details page and it is the field marked as "Measurement ID"
# It will be in the form of "G-XXXXXXXXXX"
export DATAFED_GOOGLE_ANALYTICS_TAG="$local_DATAFED_GOOGLE_ANALYTICS_TAG"

# ****************************************************************************
# Env Variables for DataFed Core server administrative and operational scripts
# ****************************************************************************
# The admin should who should be receiving emails about the backups
export DATAFED_ADMIN_EMAIL=""
# DataFed system email is from the actual system not from a person, it is
# used to fill in the from field when sending emails out to admins or users.
export DATAFED_SYSTEM_EMAIL=""
# Where the database backups will be placed.
export DATAFED_DATABASE_BACKUP_PATH=""

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
# \$DATAFED_GCS_COLLECTION_ROOT_PATH/\$DATAFED_REPO_ID_AND_DIR"
#
# So if these variables are defined as:
# DATAFED_GCS_ROOT_NAME="datafed-home"
# DATAFED_GCS_COLLECTION_ROOT_PATH="/home/cades/collections/mapped/"
#
# A folder named
#
# "/home/cades/collections/mapped/datafed-home"
#
# Will be created
export DATAFED_GCS_COLLECTION_BASE_PATH="$local_DATAFED_GCS_COLLECTION_BASE_PATH"
export DATAFED_GCS_COLLECTION_ROOT_PATH="$local_DATAFED_GCS_COLLECTION_ROOT_PATH"
# The DataFed repo id, this also must be the name
# of the directory that will be placed in Globus
# collection, avoid using spaces in the name.
# i.e. DATAFED_REPO_ID_AND_DIR="datafed-home"
export DATAFED_REPO_ID_AND_DIR="$local_DATAFED_REPO_ID_AND_DIR"
# Institutionally allowed domains, users that have accounts in these domains
# will have the ability to store data on the repository.
# i.e. ornl.gov or cu.edu or gmail.com by default clients.auth.globus.org
# must be allowed to allow automatic setup.
export DATAFED_GLOBUS_ALLOWED_DOMAINS="$local_DATAFED_GLOBUS_ALLOWED_DOMAINS"
# Globus control port default is 443, might want to change if hosting
# a web server on the same machine.
export DATAFED_GLOBUS_CONTROL_PORT="$local_DATAFED_GLOBUS_CONTROL_PORT"
# Globus subscription ID
export DATAFED_GLOBUS_SUBSCRIPTION="${local_DATAFED_GLOBUS_SUBSCRIPTION}"
EOF
