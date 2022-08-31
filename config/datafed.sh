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
# The name of the Globus storage gateway to use with
# the DataFed repo server.
export GCS_GATEWAY_NAME=""
# The name assigned to the mapped collection, that
# is to be created.
export GCS_MAPPED_COLLECTION_NAME=""
# The POSIX path to the mapped collection.
# i.e. /home/cades/collections
export GCS_MAPPED_COLLECTION_PATH=""
# The DataFed repo id, this also must be the name
# of the directory that will be placed in Globus 
# collection, avoid using spaces in the name.
# i.e. DATAFED_REPO_ID_AND_DIR="datafed-home"
export DATAFED_REPO_ID_AND_DIR=""
