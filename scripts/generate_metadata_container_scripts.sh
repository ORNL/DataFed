#!/bin/bash

# Cannot run with -u because we check for unbound variables
# and the script will exit prematurely if '-u' is set
set -ef -o pipefail

SCRIPT=$(realpath "$0")
FILE_NAME=$(basename "${SCRIPT}")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${PROJECT_ROOT}/config/datafed.sh"

VERSION="1.0.0"
echo "$FILE_NAME $VERSION"

Help() {
  echo "$(basename $0) Will set up the docker container scripts for the metadata server"
  echo
  echo "Syntax: $(basename $0) [-h|t|b]"
  echo "options:"
  echo "-h, --help                  Print this help message."
  echo "-t, --docker-tag		  	The tag on Savannah that the currently released containers are under"
  echo "-b, --backup-directory		The backup directory that will be mounted into the database container at /backups"
  echo
}

local_DOCKER_TAG=""
local_BACKUP_DIRECTORY=""

if [ -z "${DATAFED_DOCKER_TAG}" ]; then
  local_DOCKER_TAG=""
else
  local_DOCKER_TAG=$(printenv DATAFED_DOCKER_TAG)
fi

VALID_ARGS=$(getopt -o ht:b: --long 'help',docker-tag:,backup-directory: -- "$@")
if [[ $? -ne 0 ]]; then
  exit 1
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -t | --docker-tag)
    local_DOCKER_TAG=$2
    shift 2
    ;;
  -b | --backup-directory)
    local_BACKUP_DIRECTORY=$2
    shift 2
    ;;
  --)
    shift
    break
    ;;
  \?) # incorrect option
    echo "Error: Invalid option"
    exit
    ;;
  esac
done

ERROR_DETECTED=0

if [ -z "$local_DOCKER_TAG" ]; then
  echo "Error DOCKER_TAG is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -t, --docker-tag"
  echo "      or with the environment variable DATAFED_DOCKER_TAG."
  ERROR_DETECTED=1
fi

if [ -z "$local_BACKUP_DIRECTORY" ]; then
  echo "Error BACKUP_DIRECTORY is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -b, --backup-directory"
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

CREATE_DATAFED_NETWORK_SCRIPT="$DATAFED_INSTALL_PATH/scripts/create_datafed_network.sh"
RUN_ARANGO_SCRIPT="$DATAFED_INSTALL_PATH/scripts/run_arango_container.sh"
STOP_ARANGO_SCRIPT="$DATAFED_INSTALL_PATH/scripts/stop_arango_container.sh"
REMOVE_ARANGO_SCRIPT="$DATAFED_INSTALL_PATH/scripts/remove_arango_container.sh"
RUN_CORE_SCRIPT="$DATAFED_INSTALL_PATH/scripts/run_core_container.sh"
STOP_CORE_SCRIPT="$DATAFED_INSTALL_PATH/scripts/stop_core_container.sh"
REMOVE_CORE_SCRIPT="$DATAFED_INSTALL_PATH/scripts/remove_core_container.sh"
RUN_WEB_SCRIPT="$DATAFED_INSTALL_PATH/scripts/run_web_container.sh"
STOP_WEB_SCRIPT="$DATAFED_INSTALL_PATH/scripts/stop_web_container.sh"
REMOVE_WEB_SCRIPT="$DATAFED_INSTALL_PATH/scripts/remove_web_container.sh"
RUN_NGINX_SCRIPT="$DATAFED_INSTALL_PATH/scripts/run_nginx_container.sh"
STOP_NGINX_SCRIPT="$DATAFED_INSTALL_PATH/scripts/stop_nginx_container.sh"
REMOVE_NGINX_SCRIPT="$DATAFED_INSTALL_PATH/scripts/remove_nginx_container.sh"

local_DOCKER_TAG_WEB_SAFE=$(echo $local_DOCKER_TAG | sed 's/\./_/g')

cat <<EOF >"$CREATE_DATAFED_NETWORK_SCRIPT"
#!/bin/bash

docker network create datafed-network
EOF

cat <<EOF >"$RUN_ARANGO_SCRIPT"
#!/bin/bash

CONFIG_FILE_PATH="\$DATAFED_INSTALL_PATH/config/datafed.sh"
source "\${CONFIG_FILE_PATH}"

docker run -d \\
	--restart=always \\
	--name arangodb \\
	--log-driver=json-file \\
	--log-opt max-size=10m \\
	--log-opt max-file=3 \\
	-e ARANGO_ROOT_PASSWORD="\$DATAFED_DATABASE_PASSWORD" \\
	-e LANG="en_US" \\
	--network datafed-network \\
	-p 8529:8529 \\
	-v arangodb_data:/var/lib/arangodb3:Z \\
	-v "$local_BACKUP_DIRECTORY:/backups" \\
	-t "arangodb/enterprise:3.12" 
EOF

cat <<EOF >"$STOP_ARANGO_SCRIPT"
#!/bin/bash

docker container stop arangodb
EOF

cat <<EOF >"$REMOVE_ARANGO_SCRIPT"
#!/bin/bash

docker container stop arangodb
docker container rm arangodb
EOF

cat <<EOF >"$RUN_CORE_SCRIPT"
#!/bin/bash

CONFIG_FILE_PATH="\$DATAFED_INSTALL_PATH/config/datafed.sh"
source "\${CONFIG_FILE_PATH}"

USER_ID=\$(id -u)

docker run -d \\
	--restart=always \\
	--name datafed-core-$local_DOCKER_TAG \\
	--log-driver=json-file \\
	--log-opt max-size=10m \\
	--log-opt max-file=3 \\
	-e DATAFED_GLOBUS_APP_SECRET="\$DATAFED_GLOBUS_APP_SECRET" \\
	-e DATAFED_GLOBUS_APP_ID="\$DATAFED_GLOBUS_APP_ID" \\
	-e DATAFED_ZEROMQ_SESSION_SECRET="\$DATAFED_ZEROMQ_SESSION_SECRET" \\
	-e DATAFED_ZEROMQ_SYSTEM_SECRET="\$DATAFED_ZEROMQ_SYSTEM_SECRET" \\
	-e DATAFED_DOMAIN="\$DATAFED_DOMAIN" \\
	-e DATAFED_DATABASE_PASSWORD="\$DATAFED_DATABASE_PASSWORD" \\
	-e DATAFED_DATABASE_IP_ADDRESS_PORT="http://\$DATAFED_DATABASE_HOST:\$DATAFED_DATABASE_PORT" \\
	-e DATAFED_DEFAULT_LOG_PATH="/datafed/logs" \\
	-e DATAFED_CORE_ADDRESS_PORT_INTERNAL="\$DATAFED_CORE_ADDRESS_PORT_INTERNAL" \\
	-e DATAFED_CORE_CLIENT_THREADS="24" \\
	-e DATAFED_CORE_TASK_THREADS="24" \\
	-e UID="\$USER_ID" \\
	--network datafed-network \\
	-p 7513:7513 \\
	-p 7512:7512 \\
	-v "\$DATAFED_INSTALL_PATH/logs:/datafed/logs" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed-core-key.pub:/opt/datafed/keys/datafed-core-key.pub" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed-core-key.priv:/opt/datafed/keys/datafed-core-key.priv" \\
	-t "datafed/core:$local_DOCKER_TAG" 
EOF

cat <<EOF >"$STOP_CORE_SCRIPT"
#!/bin/bash

docker container stop datafed-core-$local_DOCKER_TAG
EOF

cat <<EOF >"$REMOVE_CORE_SCRIPT"
#!/bin/bash

docker container stop datafed-core-$local_DOCKER_TAG
docker container rm datafed-core-$local_DOCKER_TAG
EOF

cat <<EOF >"$RUN_WEB_SCRIPT"
#!/bin/bash

CONFIG_FILE_PATH="\$DATAFED_INSTALL_PATH/config/datafed.sh"
source "\$CONFIG_FILE_PATH"

USER_ID=\$(id -u)

docker run -d \\
	--restart=always \\
	--name datafed-web-$local_DOCKER_TAG_WEB_SAFE \\
	--log-driver=json-file \\
	--log-opt max-size=10m \\
	--log-opt max-file=3 \\
	-e DATAFED_GLOBUS_APP_SECRET="\$DATAFED_GLOBUS_APP_SECRET" \\
	-e DATAFED_GLOBUS_APP_ID="\$DATAFED_GLOBUS_APP_ID" \\
	-e DATAFED_ZEROMQ_SESSION_SECRET="\$DATAFED_ZEROMQ_SESSION_SECRET" \\
	-e DATAFED_ZEROMQ_SYSTEM_SECRET="\$DATAFED_ZEROMQ_SYSTEM_SECRET" \\
	-e DATAFED_DOMAIN="\$DATAFED_DOMAIN" \\
	-e DATAFED_WEB_CERT_PATH="\$DATAFED_WEB_CERT_PATH" \\
	-e DATAFED_WEB_KEY_PATH="\$DATAFED_WEB_KEY_PATH" \\
	-e DATAFED_DEFAULT_LOG_PATH="/datafed/logs" \\
	-e DATAFED_CORE_ADDRESS_PORT_INTERNAL="\$DATAFED_CORE_ADDRESS_PORT_INTERNAL" \\
	-e DATAFED_GOOGLE_ANALYTICS_TAG="\$DATAFED_GOOGLE_ANALYTICS_TAG" \\
	-e UID="\$USER_ID" \\
	--network datafed-network \\
	-v "\$DATAFED_INSTALL_PATH/logs:/datafed/logs" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed-core-key.pub:/opt/datafed/keys/datafed-core-key.pub" \\
	-v "\$DATAFED_WEB_CERT_PATH:\$DATAFED_WEB_CERT_PATH" \\
	-v "\$DATAFED_WEB_KEY_PATH:\$DATAFED_WEB_KEY_PATH" \\
	-t "datafed/web:$local_DOCKER_TAG"
EOF

cat <<EOF >"$STOP_WEB_SCRIPT"
#!/bin/bash

docker container stop datafed-web-$local_DOCKER_TAG_WEB_SAFE
EOF

cat <<EOF >"$REMOVE_WEB_SCRIPT"
#!/bin/bash

docker container stop datafed-web-$local_DOCKER_TAG_WEB_SAFE
docker container rm datafed-web-$local_DOCKER_TAG_WEB_SAFE
EOF

cat <<EOF >"$RUN_NGINX_SCRIPT"
#!/bin/bash

CONFIG_FILE_PATH="\$DATAFED_INSTALL_PATH/config/datafed.sh"
source "\$CONFIG_FILE_PATH"

docker run -d \\
	--restart=always \\
	--name datafed-nginx \\
	--network datafed-network \\
	--log-driver=json-file \\
	--log-opt max-size=10m \\
	--log-opt max-file=3 \\
	-p 443:443 \\
	-p 80:80 \\
	-v "\$DATAFED_INSTALL_PATH/nginx/nginx.conf:/etc/nginx/conf.d/default.conf" \\
	-v "\$DATAFED_INSTALL_PATH/nginx/sites-enabled:/etc/nginx/sites-enabled" \\
	-v "\$DATAFED_INSTALL_PATH/nginx/www:/www" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed.ornl.gov.crt:/etc/nginx/certs/datafed.ornl.gov.crt" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed.ornl.gov.key:/etc/nginx/certs/datafed.ornl.gov.key" \\
	nginx:latest
EOF

cat <<EOF >"$STOP_NGINX_SCRIPT"
#!/bin/bash

docker container stop datafed-nginx
EOF

cat <<EOF >"$REMOVE_NGINX_SCRIPT"
#!/bin/bash

docker container stop datafed-nginx
docker container rm datafed-nginx
EOF

chmod +x "$CREATE_DATAFED_NETWORK_SCRIPT"

chmod +x "$RUN_ARANGO_SCRIPT"
chmod +x "$STOP_ARANGO_SCRIPT"
chmod +x "$REMOVE_ARANGO_SCRIPT"

chmod +x "$RUN_CORE_SCRIPT"
chmod +x "$STOP_CORE_SCRIPT"
chmod +x "$REMOVE_CORE_SCRIPT"

chmod +x "$RUN_WEB_SCRIPT"
chmod +x "$STOP_WEB_SCRIPT"
chmod +x "$REMOVE_WEB_SCRIPT"

chmod +x "$RUN_NGINX_SCRIPT"
chmod +x "$STOP_NGINX_SCRIPT"
chmod +x "$REMOVE_NGINX_SCRIPT"
