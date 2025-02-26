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

Help()
{
  echo "$(basename $0) Will set up the docker container scripts for the repository server"
  echo
  echo "Syntax: $(basename $0) [-h|t|v|i|d]"
  echo "options:"
  echo "-h, --help                    Print this help message."
  echo "-t, --docker-tag		          The tag on Savannah that the currently released containers are under"
  echo "-v, --repo-volume-mounts      The extra volumes mounts to add to the repository server, comma separated"
  echo "-i, --ip-address		          The public ip address of the host that the GCS container is running on"
  echo "-d, --repo-domain		          The publicly accessible domain of the server that the host is running on"
  echo
}

local_DOCKER_TAG=""
local_IP_ADDRESS=""
local_REPO_DOMAIN=""
local_REPO_VOLUME_MOUNTS=""

if [ -z "${DATAFED_DOCKER_TAG}" ]
then
  local_DOCKER_TAG=""
else
  local_DOCKER_TAG=$(printenv DATAFED_DOCKER_TAG)
fi

VALID_ARGS=$(getopt -o ht:v:i:d: --long 'help',docker-tag:,repo-volume-mounts:,ip-address:,repo-domain: -- "$@")
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
    -v | --repo-volume-mounts)
        local_REPO_VOLUME_MOUNTS=$2
        shift 2
        ;;
    -i | --ip-address)
        local_IP_ADDRESS=$2
        shift 2
        ;;
    -d | --repo-domain)
        local_REPO_DOMAIN=$2
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

if [ -z "$local_IP_ADDRESS" ]
then
  echo "Error IP_ADDRESS is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -i, --ip-address"
  ERROR_DETECTED=1
fi

if [ -z "$local_REPO_DOMAIN" ]
then
  echo "Error REPO_DOMAIN is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -d, --repo-domain"
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]
then
  exit 1
fi

RUN_REPO_SCRIPT="$DATAFED_INSTALL_PATH/scripts/run_repo_container.sh"
STOP_REPO_SCRIPT="$DATAFED_INSTALL_PATH/scripts/stop_repo_container.sh"
REMOVE_REPO_SCRIPT="$DATAFED_INSTALL_PATH/scripts/remove_repo_container.sh"
RUN_GCS_SCRIPT="$DATAFED_INSTALL_PATH/scripts/run_gcs_container.sh"
STOP_GCS_SCRIPT="$DATAFED_INSTALL_PATH/scripts/stop_gcs_container.sh"
REMOVE_GCS_SCRIPT="$DATAFED_INSTALL_PATH/scripts/remove_gcs_container.sh"

IFS=',' read -ra local_REPO_VOLUME_MOUNTS <<< "$local_REPO_VOLUME_MOUNTS"
local_REPO_VOLUME_MOUNTS_EXPANDED=""
for volume_mount in "${local_REPO_VOLUME_MOUNTS[@]}"; do
  local_REPO_VOLUME_MOUNTS_EXPANDED+="-v \"$volume_mount\" "
done

cat << EOF > "$RUN_REPO_SCRIPT"
#!/bin/bash

CONFIG_FILE_PATH="\$DATAFED_INSTALL_PATH/config/datafed.sh"
source "\${CONFIG_FILE_PATH}"

USER_ID=\$(id -u)

docker run -d \\
	--restart=always \\
	--name "datafed-repo-$local_DOCKER_TAG" \\
	--log-driver=json-file \\
	--log-opt max-size=10m \\
	--log-opt max-file=3 \\
	-e DATAFED_GLOBUS_APP_SECRET="\$DATAFED_GLOBUS_APP_SECRET" \\
	-e DATAFED_GLOBUS_APP_ID="\$DATAFED_GLOBUS_APP_ID" \\
	-e DATAFED_ZEROMQ_SESSION_SECRET="\$DATAFED_ZEROMQ_SESSION_SECRET" \\
	-e DATAFED_ZEROMQ_SYSTEM_SECRET="\$DATAFED_ZEROMQ_SYSTEM_SECRET" \\
	-e DATAFED_HTTPS_SERVER_PORT="443" \\
	-e DATAFED_DOMAIN="\$DATAFED_DOMAIN" \\
	-e DATAFED_CORE_ADDRESS_PORT_INTERNAL="\$DATAFED_DOMAIN:7513" \\
	-e DATAFED_DEFAULT_LOG_PATH="\$DATAFED_DEFAULT_LOG_PATH" \\
	-e DATAFED_GCS_BASE_PATH="\$DATAFED_GCS_COLLECTION_BASE_PATH" \\
	-e DATAFED_GCS_COLLECTION_BASE_PATH="\$DATAFED_GCS_COLLECTION_BASE_PATH" \\
	-e DATAFED_GCS_COLLECTION_ROOT_PATH="\$DATAFED_GCS_COLLECTION_ROOT_PATH" \\
	-e UID="\$USER_ID" \\
	-p 9000:9000 \\
	-v "\$DATAFED_INSTALL_PATH/logs:/datafed/logs" \\
  $local_REPO_VOLUME_MOUNTS_EXPANDED \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed-repo-key.pub:/opt/datafed/keys/datafed-repo-key.pub" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed-repo-key.priv:/opt/datafed/keys/datafed-repo-key.priv" \\
	-t "datafed/repo:$local_DOCKER_TAG"
EOF

cat << EOF > "$STOP_REPO_SCRIPT"
#!/bin/bash

docker container stop datafed-repo-$local_DOCKER_TAG
EOF

cat << EOF > "$REMOVE_REPO_SCRIPT"
#!/bin/bash

docker container stop datafed-repo-$local_DOCKER_TAG
docker container rm datafed-repo-$local_DOCKER_TAG
EOF

cat << EOF > "$RUN_GCS_SCRIPT"
#!/bin/bash

CONFIG_FILE_PATH="\$DATAFED_INSTALL_PATH/config/datafed.sh"
source "\${CONFIG_FILE_PATH}"

USER_ID=\$(id -u)

docker run -d \\
	--restart=always \\
	--name "datafed-gcs-$local_DOCKER_TAG" \\
	-e DATAFED_GLOBUS_APP_SECRET="\$DATAFED_GLOBUS_APP_SECRET" \\
	-e DATAFED_GLOBUS_APP_ID="\$DATAFED_GLOBUS_APP_ID" \\
	-e DATAFED_ZEROMQ_SESSION_SECRET="\$DATAFED_ZEROMQ_SESSION_SECRET" \\
	-e DATAFED_ZEROMQ_SYSTEM_SECRET="\$DATAFED_ZEROMQ_SYSTEM_SECRET" \\
	-e DATAFED_HTTPS_SERVER_PORT="443" \\
	-e DATAFED_DOMAIN="\$DATAFED_DOMAIN" \\
	-e DATAFED_CORE_ADDRESS_PORT_INTERNAL="\$DATAFED_DOMAIN:7513" \\
	-e DATAFED_DEFAULT_LOG_PATH="\$DATAFED_DEFAULT_LOG_PATH" \\
	-e DATAFED_GCS_COLLECTION_BASE_PATH="\$DATAFED_GCS_COLLECTION_BASE_PATH" \\
	-e DATAFED_GCS_COLLECTION_ROOT_PATH="\$DATAFED_GCS_COLLECTION_ROOT_PATH" \\
	-e DATAFED_GCS_ROOT_NAME="\$DATAFED_GCS_ROOT_NAME" \\
	-e DATAFED_GLOBUS_SUBSCRIPTION="\$DATAFED_GLOBUS_SUBSCRIPTION" \\
	-e DATAFED_GLOBUS_CONTROL_PORT="\$DATAFED_GLOBUS_CONTROL_PORT" \\
	-e DATAFED_REPO_USER="datafed" \\
	-e DATAFED_AUTHZ_USER="datafed" \\
	-e BUILD_WITH_METADATA_SERVICES="FALSE" \\
	-e DATAFED_REPO_ID_AND_DIR="\$DATAFED_REPO_ID_AND_DIR" \\
	-e DATAFED_GCS_IP="$local_IP_ADDRESS" \\
	-e DATAFED_REPO_DOMAIN="$local_REPO_DOMAIN" \\
	-e UID="\$USER_ID" \\
	--network=host \\
	-v "\$DATAFED_INSTALL_PATH/logs:/datafed/logs" \\
  $local_REPO_VOLUME_MOUNTS_EXPANDED \\
	-v "\$DATAFED_INSTALL_PATH/globus:/opt/datafed/globus" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed-repo-key.pub:/opt/datafed/keys/datafed-repo-key.pub" \\
	-v "\$DATAFED_INSTALL_PATH/keys/datafed-repo-key.priv:/opt/datafed/keys/datafed-repo-key.priv" \\
	-t "datafed/gcs:$local_DOCKER_TAG"
EOF

cat << EOF > "$STOP_GCS_SCRIPT"
#!/bin/bash

docker container stop datafed-gcs-$local_DOCKER_TAG
EOF

cat << EOF > "$REMOVE_GCS_SCRIPT"
#!/bin/bash

docker container stop datafed-gcs-$local_DOCKER_TAG
docker container rm datafed-gcs-$local_DOCKER_TAG
EOF

chmod +x "$RUN_REPO_SCRIPT"
chmod +x "$STOP_REPO_SCRIPT"
chmod +x "$REMOVE_REPO_SCRIPT"

chmod +x "$RUN_GCS_SCRIPT"
chmod +x "$STOP_GCS_SCRIPT"
chmod +x "$REMOVE_GCS_SCRIPT"
