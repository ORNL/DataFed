#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

# Entry point file expects that the directory where the DataFed source file
# is passed in as the first argument

echo "SOURCE BUILD DIR $BUILD_DIR"

# Here we will rerun datafed configuration script to create a new set of
# default variables that are useful for setting up the DataFed Python client
# ini file

"${BUILD_DIR}/scripts/generate_datafed.sh"
source "${BUILD_DIR}/config/datafed.sh"

mkdir -p "/home/datafed/.datafed"

# At this point we will create an ini file
cat <<EOF >"/home/datafed/.datafed/datafed-client.ini"
[server]
host = ${DATAFED_DOMAIN}
port = ${DATAFED_SERVER_PORT}
config_dir = /home/datafed/.datafed

[client]
config_dir = /home/datafed/.datafed

EOF

if [ "$#" -eq 0 ]; then
  echo "No arguments were passed, running bash"
  exec "/home/datafed/.local/bin/datafed --cfg  /home/datafed/.datafed/datafed-client.ini"
fi

"$@"
