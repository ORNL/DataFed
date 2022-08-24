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
