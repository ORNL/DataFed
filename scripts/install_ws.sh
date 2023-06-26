#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)
source ${PROJECT_ROOT}/config/datafed.sh
source ${SOURCE}/dependency_versions.sh

# Make sure paths exist
mkdir -p ${DATAFED_INSTALL_PATH}/web
mkdir -p ${DATAFED_INSTALL_PATH}/keys
mkdir -p ${DATAFED_DEFAULT_LOG_PATH}

# Install web node modules
cp "$PROJECT_ROOT/web/package.json" ${DATAFED_INSTALL_PATH}/web/

export npm_config_cache=${DATAFED_INSTALL_PATH}/web
# Check if npm exists
{
  npm_path=$(which npm)
} || {
  echo "npm_path not found."
}
if [ -z "$npm_path" ]
then

  {
    # Will return a result if nvm can be found and returns nothing otherwise
    # which does not work with nvm
    nvm_command_exists=$(command -v nvm)
  } || {
    echo "nvm_command_exists not found."
  }

  if [ -z "$nvm_path" ]
  then
    # Check for nvm in default location when installed with web dependencies
    # script
    if [ -d "$NVM_DIR" ]
    then
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    elif [ -d "$HOME/.nvm" ]
    then
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
      {
    	nvm_command_exists=$(command -v nvm)
      } || {
        echo "nvm_command_exists not found after sourcing."
      }
      if [ -z "$nvm_path" ]
      then
        echo "ERROR Unable to locate npm or nvm."
        exit 1
      fi
    else
      echo "ERROR Unable to locate npm or nvm."
      exit 1
    fi

  fi
  nvm use $DATAFED_NODE_VERSION
fi
{
  npm --allow-root --unsafe-perm --prefix ${DATAFED_INSTALL_PATH}/web install 
} || {
  echo "ERROR npm command failed!"
  exit 1
}
# Install javascript web server repo and core server were 
# already installed by CMake
cp "$PROJECT_ROOT/web/datafed-ws.js" ${DATAFED_INSTALL_PATH}/web

# Copy configuration files
cp "$PROJECT_ROOT/config/datafed-ws.cfg" ${DATAFED_INSTALL_PATH}/web

# Make sure that the datafed-core-pub.key exists in the web/static folder
if [[ -z  "${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub" ]]
then
  echo "ERROR unable to locate datafed-core-key.pub in ${DATAFED_INSTALL_PATH}/keys the public key is needed by the web server exiting"
  exit 1
fi

cp ${DATAFED_INSTALL_PATH}/keys/datafed-core-key.pub "$PROJECT_ROOT/web/static/"
