#!/bin/bash

# Cannot run with -u because we check for unbound variables
# and the script will exit prematurely if '-u' is set
set -ef -o pipefail

SCRIPT=$(realpath "$0")
FILE_NAME=$(basename "${SCRIPT}")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/..")

$PROJECT_ROOT/config/datafed.sh

VERSION="1.0.0"
echo "$FILE_NAME $VERSION"

Help()
{
  echo "$(basename $0) Will set up the docker container scripts for the metadata server"
  echo
  echo "Syntax: $(basename $0) [-h|u|p|o]"
  echo "options:"
  echo "-h, --help                        Print this help message."
  echo "-t, --docker-tag		  The tag on the selected registry that the currently released containers are under"
  echo "-c, --core-name			  The name of the core container"
  echo "-o, --core-image		  The name of the core image"
  echo "-w, --web-name			  The name of the web container"
  echo "-e, --web-image			  The name of the web image"
  echo "-v, --volume-base-path		  The base path for the majority of the volume mounts (Default: \$DATAFED_INSTALL_PATH)"
  echo "-r, --volume-cert-path		  The path for the web certificate file (Default: \$DATAFED_WEB_CERT_PATH)"
  echo "-k, --volume-key-path		  The path for the web key file (Default: \$DATAFED_WEB_KEY_PATH)"
  echo "-i, --install-path		  The path to install the generated scripts to (Default: \$DATAFED_INSTALL_PATH)"
  echo
}

local_DOCKER_TAG=""
local_CORE_NAME=""
local_WEB_NAME=""
local_CORE_IMAGE="datafed-core-prod"
local_WEB_IMAGE="datafed-web-prod"
local_VOLUME_BASE_PATH="\$DATAFED_INSTALL_PATH"
local_VOLUME_CERT_PATH="\$DATAFED_WEB_CERT_PATH"
local_VOLUME_KEY_PATH="\$DATAFED_WEB_KEY_PATH"
local_INSTALL_PATH="$DATAFED_INSTALL_PATH"
local_CONFIG_PATH="$PROJECT_ROOT"

if [ -z "${DATAFED_DOCKER_TAG}" ]
then
  local_DOCKER_TAG=""
else
  local_DOCKER_TAG=$(printenv DATAFED_DOCKER_TAG)
fi

VALID_ARGS=$(getopt -o ht:c:n:o:e:v:r:k:i: --long 'help',docker-tag:,core-name:,web-name:,core-image:,web-image:,volume-base-path:,volume-cert-path:,volume-key-path:,install-path: -- "$@")
if [[ $? -ne 0 ]]; then
      exit 1;
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
    -c | --core-name)
        local_CORE_NAME=$2
        shift 2
        ;;
    -o | --core-image)
        local_CORE_IMAGE=$2
        shift 2
        ;;
    -w | --web-name)
        local_WEB_NAME=$2
        shift 2
        ;;
    -e | --web-image)
        local_WEB_IMAGE=$2
        shift 2
        ;;
    -v | --volume-base-path)
        local_VOLUME_BASE_PATH=$2
        shift 2
        ;;
    -r | --volume-cert-path)
        local_VOLUME_CERT_PATH=$2
        shift 2
        ;;
    -k | --volume-key-path)
        local_VOLUME_KEY_PATH=$2
        shift 2
        ;;
    -i | --install-path)
        local_INSTALL_PATH=$2
        shift 2
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

ERROR_DETECTED=0
if [ -z "$local_DOCKER_TAG" ]
then
  echo "Error DOCKER_TAG is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -t, --docker-tag"
  echo "      or with the environment variable DATAFED_DOCKER_TAG."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]
then
  exit 1
fi

if [ -z "$local_CORE_NAME" ]
then
  local_CORE_NAME="datafed-core_$local_DOCKER_TAG"
fi

if [ -z "$local_WEB_NAME" ]
then
  local_WEB_NAME="datafed-web_$local_DOCKER_TAG"
fi

mkdir -p "$local_INSTALL_PATH"

cat << EOF > "$local_INSTALL_PATH/scripts/create_datafed_network.sh"
#!/bin/bash

docker network create datafed-network
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/remove_datafed_network.sh"
#!/bin/bash

docker network rm datafed-network
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/run_core_container.sh"
#!/bin/bash

CONFIG_FILE_PATH="$local_CONFIG_PATH/config/datafed.sh"
source "\${CONFIG_FILE_PATH}"

USER_ID=$(id -u)

docker run -d \\
	--restart=always \\
	--name $local_CORE_NAME \\
	-e DATAFED_GLOBUS_APP_SECRET="\$DATAFED_GLOBUS_APP_SECRET" \\
	-e DATAFED_GLOBUS_APP_ID="\$DATAFED_GLOBUS_APP_ID" \\
	-e DATAFED_ZEROMQ_SESSION_SECRET="\$DATAFED_ZEROMQ_SESSION_SECRET" \\
	-e DATAFED_ZEROMQ_SYSTEM_SECRET="\$DATAFED_ZEROMQ_SYSTEM_SECRET" \\
	-e DATAFED_DOMAIN="\$DATAFED_DOMAIN" \\
	-e DATAFED_DATABASE_PASSWORD="\$DATAFED_DATABASE_PASSWORD" \\
	-e DATAFED_DATABASE_IP_ADDRESS_PORT="http://\$DATAFED_DATABASE_HOST:\$DATAFED_DATABASE_PORT" \\
	-e DATAFED_DEFAULT_LOG_PATH="/datafed/logs" \\
	-e DATAFED_CORE_ADDRESS_PORT_INTERNAL="\$DATAFED_CORE_ADDRESS_PORT_INTERNAL" \\
	-e UID="\$USER_ID" \\
	--network datafed-network \\
	-p 7513:7513 \\
	-p 7512:7512 \\
	-v "$local_VOLUME_BASE_PATH/logs:/datafed/logs" \\
	-v "$local_VOLUME_BASE_PATH/keys/datafed-core-key.pub:/opt/datafed/keys/datafed-core-key.pub" \\
	-v "$local_VOLUME_BASE_PATH/keys/datafed-core-key.priv:/opt/datafed/keys/datafed-core-key.priv" \\
	-t "$local_CORE_IMAGE:$local_DOCKER_TAG" 
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/stop_core_container.sh"
#!/bin/bash

docker container stop $local_CORE_NAME
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/remove_core_container.sh"
#!/bin/bash

docker container stop $local_CORE_NAME
docker container rm $local_CORE_NAME
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/run_web_container.sh"
#!/bin/bash

CONFIG_FILE_PATH="$local_CONFIG_PATH/config/datafed.sh"
source "\$CONFIG_FILE_PATH"

USER_ID=$(id -u)

docker run -d \\
	--restart=always \\
	--name $local_WEB_NAME \\
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
	-v "$local_VOLUME_BASE_PATH/logs:/datafed/logs" \\
	-v "$local_VOLUME_BASE_PATH/keys/datafed-core-key.pub:/opt/datafed/keys/datafed-core-key.pub" \\
	-v "$local_VOLUME_CERT_PATH:$local_VOLUME_CERT_PATH" \\
	-v "$local_VOLUME_KEY_PATH:$local_VOLUME_KEY_PATH" \\
	-t "$local_WEB_IMAGE:$local_DOCKER_TAG"
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/stop_web_container.sh"
#!/bin/bash

docker container stop $local_WEB_NAME
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/remove_web_container.sh"
#!/bin/bash

docker container stop $local_WEB_NAME
docker container rm $local_WEB_NAME
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/run_nginx_container.sh"
#!/bin/bash

CONFIG_FILE_PATH="$local_CONFIG_PATH/config/datafed.sh"
source "\$CONFIG_FILE_PATH"

USER_ID=$(id -u)

docker run -d \
	--restart=always \
	--name datafed-nginx \
	--network datafed-network \
	-p 443:443 \
	-p 80:80 \
	-v "$local_VOLUME_BASE_PATH/nginx/nginx.conf:/etc/nginx/conf.d/default.conf" \
	-v "$local_VOLUME_BASE_PATH/nginx/sites-enabled:/etc/nginx/sites-enabled" \
	-v "$local_VOLUME_BASE_PATH/nginx/www:/www" \
	-v "$local_VOLUME_BASE_PATH/keys/datafed.ornl.gov.crt:/etc/nginx/certs/datafed.ornl.gov.crt" \
	-v "$local_VOLUME_BASE_PATH/keys/datafed.ornl.gov.key:/etc/nginx/certs/datafed.ornl.gov.key" \
	nginx:latest
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/stop_nginx_container.sh"
#!/bin/bash

docker container stop datafed-nginx
EOF

cat << EOF > "$local_INSTALL_PATH/scripts/remove_nginx_container.sh"
#!/bin/bash

docker container stop datafed-nginx
docker container rm datafed-nginx
EOF

chmod +x "$local_INSTALL_PATH/scripts/create_datafed_network.sh"
chmod +x "$local_INSTALL_PATH/scripts/remove_datafed_network.sh"

chmod +x "$local_INSTALL_PATH/scripts/run_core_container.sh"
chmod +x "$local_INSTALL_PATH/scripts/stop_core_container.sh"
chmod +x "$local_INSTALL_PATH/scripts/remove_core_container.sh"

chmod +x "$local_INSTALL_PATH/scripts/run_web_container.sh"
chmod +x "$local_INSTALL_PATH/scripts/stop_web_container.sh"
chmod +x "$local_INSTALL_PATH/scripts/remove_web_container.sh"

chmod +x "$local_INSTALL_PATH/scripts/run_nginx_container.sh"
chmod +x "$local_INSTALL_PATH/scripts/stop_nginx_container.sh"
chmod +x "$local_INSTALL_PATH/scripts/remove_nginx_container.sh"
