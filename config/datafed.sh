#!/bin/env bash

# This is the master DataFed configuration file

# ************************************************
# Env Variables for Core Server
# ************************************************
export DATABASE_PASSWORD=""

# ************************************************
# Env Variables for Web Server
# ************************************************
export DATAFED_ZEROMQ_SESSION_SECRET=""
export DATAFED_ZEROMQ_SYSTEM_SECRET=""
# An email address is required by LEGO when 
# requesting certificates for the domain
export DATAFED_LEGO_EMAIL=""

# ************************************************
# Env Variables for Core & Web Server
# ************************************************
export DATAFED_GLOBUS_APP_ID=""
export DATAFED_GLOBUS_APP_SECRET=""

# ************************************************
# Env Variables for Repo Server
# ************************************************
# i.e. datafed-server-test.ornl.gov:7512
export DATAFED_SERVER_DOMAIN_NAME_AND_PORT=""

# ************************************************
# Env Variables for Authz, Web, Repo Server
# ************************************************
# If not set will resolve to datafed.ornl.gov
export DATAFED_DOMAIN=""

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
# DATAFED_GCS_COLLECTION_MAPPED="$DATAFED_GCS_ROOT_NAME Collection Mapped"
# DATAFED_GCS_STORAGE_GATEWAY="$DATAFED_GCS_ROOT_NAME Storage Gateway"
# 
# So using the example above these would be defined as:
#
# DATAFED_GCS_COLLECTION_MAPPED="CADES GCS Test Collection Mapped"
# DATAFED_GCS_STORAGE_GATEWAY="CADES GCS Test Storage Gateway"
export DATAFED_GCS_ROOT_NAME=""
# The POSIX path to the Globus GUEST collection.
#
# i.e. /home/cades/collections/mapped
#
# The path will be created if it does not exist
# 
# $GCS_COLLECTION_ROOT_PATH/$DATAFED_ROOT_NAME"
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
export GCS_COLLECTION_ROOT_PATH=""
# The DataFed repo id, this also must be the name
# of the directory that will be placed in Globus 
# collection, avoid using spaces in the name.
# i.e. DATAFED_REPO_ID_AND_DIR="datafed-home"
export DATAFED_REPO_ID_AND_DIR=""
