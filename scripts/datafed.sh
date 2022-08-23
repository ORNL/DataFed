#!/bin/env bash

# This is the master DataFed configuration file

# ************************************************
# Env Variables for Core Server
# ************************************************
export DATABASE_PASSWORD="mastermind"
# ************************************************
# Env Variables for Web Server
# ************************************************
export DATAFED_ZEROMQ_SESSION_SECRET="Xgdh67s-ehEE_UI9Fx5p0hksf-u3nvls7ld8"
export DATAFED_ZEROMQ_SYSTEM_SECRET="Xgdh67s-ehEE_UI9Fx5p0hksf-u3nvls7ld8"
export DATAFED_LEGO_EMAIL="brownjs@ornl.gov"
# ************************************************
# Env Variables for Core & Web Server
# ************************************************
export DATAFED_GLOBUS_APP_ID="2be799b2-f9ba-461e-8ca0-6154482e670c"
export DATAFED_GLOBUS_APP_SECRET="xUm04Ghj9SLkiw+VKGfaNLuK8+fcNCCifzC3NwZYAxc="

# ************************************************
# Env Variables for Repo Server
# ************************************************
# i.e. datafed-server-test.ornl.gov:7512
export DATAFED_SERVER_DOMAIN_NAME_AND_PORT="datafed-server-test.ornl.gov:7512"

# ************************************************
# Env Variables for Authz, Web, Repo Server
# ************************************************
# If not set will resolve to datafed.ornl.gov
export DATAFED_DOMAIN="datafed-server-test.ornl.gov"
