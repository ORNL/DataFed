#!/bin/bash

set -euf -o pipefail

# NOTE We do not need to change the user in this container because we should not have
# any log output, and running chmod to update all the folders during runtime is
# expensive!
#
# The following lines are not needed
# if [ -n "$UID" ]; then
#     usermod -u $UID datafed
# fi

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../")

# Force installation of foxx api, even if the .foxx_is_installed touch
# file exists.
local_DATAFED_FORCE_INSTALL_FOXX="${DATAFED_FORCE_INSTALL_FOXX:-FALSE}"

# Cleanup pre-existing files if they exist, you would think that the Cmake configure
# step would overwrite these files without problem. However, when running containers
# with openshift user settings, cmake complains if these files exist before hand 
# under a different user.
if [ -f "${PROJECT_ROOT}/core/database/foxx/api/version_router.js" ]; then
  rm "${PROJECT_ROOT}/core/database/foxx/api/version_router.js"
fi

if [ -f "${PROJECT_ROOT}/core/database/foxx/manifest.json" ]; then
  rm "${PROJECT_ROOT}/core/database/foxx/manifest.json"
fi

if [ -f "${PROJECT_ROOT}/common/proto/common/Version.proto" ]; then
  rm "${PROJECT_ROOT}/common/proto/common/Version.proto"
fi


install_flag="/tmp/.foxx_is_installed"
if [ "${local_DATAFED_FORCE_INSTALL_FOXX}" == "TRUE" ]; then
  if [ -f "$install_flag" ]; then
    rm "$install_flag"
  fi
fi
# Why is this flag used, it is used because the same container is used for
# compose as is for operations and ci. If you have a compose dev environment
# we may want to keep the existing state and not overwrite the database.
install_flag="/tmp/.foxx_is_installed"
if [ ! -f "$install_flag" ]; then
  echo "Installing foxx."
  log_path="$DATAFED_DEFAULT_LOG_PATH"
  if [ ! -d "${log_path}" ]; then
    mkdir -p "${log_path}" datafed
  fi

  # It should be fine to run this as root because it is an ephemeral container anyway
  cd "${PROJECT_ROOT}"
  # Check to see if foxx has previously been installed
  "${PROJECT_ROOT}/scripts/generate_datafed.sh"

  export LD_LIBRARY_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib"

  # Define common CMake options
  cmake_options=(
    -S. -B build
    -DBUILD_REPO_SERVER=False
    -DBUILD_COMMON=False
    -DBUILD_AUTHZ=False
    -DBUILD_CORE_SERVER=False
    -DBUILD_WEB_SERVER=False
    -DBUILD_DOCS=False
    -DBUILD_PYTHON_CLIENT=False
    -DBUILD_FOXX=True
    -DINSTALL_FOXX=True
  )

  # Add the ENABLE_FOXX_TESTS option if it's set to TRUE
  # Should only run this if you are ok with making changes to the database
  if [ "$ENABLE_FOXX_TESTS" == "TRUE" ]; then
    cmake_options+=(-DENABLE_FOXX_TESTS=True)
  fi

  # Run the CMake command with the constructed options
  "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake" "${cmake_options[@]}"

  "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake" --build build

  # Give arango container a minute to initialize
  # should be replaced with health check at some point
  sleep 5
  "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake" --build build --target install

  if [ "$ENABLE_FOXX_TESTS" == "TRUE" ]; then
    "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake" \
      --build build \
      --target test
    EXIT_CODE="$?"
    if [ "$EXIT_CODE" != "0" ]; then exit "$EXIT_CODE"; fi
  fi

  # Create flag to indicate container has done its job
  touch "$install_flag"
else
  echo "$install_flag has been found skipping reinstall"
fi

# Keep container alive for a little bit, the CI pipelines check that the
# container actually runs. If the container runs to fast the pipeline check
# might fail because it wasn't able to determine if the container actually
# ran.
sleep 60
