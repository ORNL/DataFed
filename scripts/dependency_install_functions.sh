#!/bin/bash
SCRIPT=$(realpath "$BASH_SOURCE[0]")
SOURCE=$(dirname "$SCRIPT")
source "${SOURCE}/dependency_versions.sh"
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${SOURCE}/utils.sh"

# Ensures the shell returns the exit code of the first failed command in a pipeline
set -o pipefail

sudo_command
# these are the dependencies to be installed by apt
export apt_file_path="${PROJECT_ROOT}/tmp/apt_deps"
export pip_file_path="${PROJECT_ROOT}/tmp/pip_deps"
# these are the dependencies to be installed and built via cmake
export ext_file_path="${PROJECT_ROOT}/tmp/ext_deps"

if [ ! -d "${PROJECT_ROOT}/tmp" ]; then
    mkdir -p "${PROJECT_ROOT}/tmp"
fi

if [ ! -e "${PROJECT_ROOT}/config/datafed.sh" ]
then
  echo "Please run generate_datafed.sh before installing dependencies"
  exit 1
fi

source "${PROJECT_ROOT}/config/datafed.sh"

if [ ! -e "$DATAFED_DEPENDENCIES_INSTALL_PATH" ] || [ ! -d "$DATAFED_DEPENDENCIES_INSTALL_PATH" ]; then
    parent_dir=$(dirname "${DATAFED_DEPENDENCIES_INSTALL_PATH}")
    if [ -w "${parent_dir}" ]; then
      mkdir -p "$DATAFED_DEPENDENCIES_INSTALL_PATH"
    else
      echo "Sudo command $SUDO_CMD"
      "$SUDO_CMD" mkdir -p "$DATAFED_DEPENDENCIES_INSTALL_PATH"
      user=$(whoami)
      "$SUDO_CMD" chown "$user" "$DATAFED_DEPENDENCIES_INSTALL_PATH"
    fi
fi

# NOTE - LD_LIBRARY_PATH must not be a variable for this to work. You cannot
# replace ! -v LD_LIBRARY_PATH with ! -v ${LD_LIBRARY_PATH} because this is
# checking if the variable even exists.
if [[ ! -v LD_LIBRARY_PATH ]]; then
  LD_LIBRARY_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib"
else
  if [[ -n "$LD_LIBRARY_PATH" ]]; then
    LD_LIBRARY_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib:$LD_LIBRARY_PATH"
  else
    LD_LIBRARY_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib"
  fi
fi

# This if statement is to make sure PKG_CONFIG_PATH is defined for cmake, and
# that it contains the necessary paths from the datafed depedencies install path
# to compile other dependencies
if [[ ! -v PKG_CONFIG_PATH ]]; then
  PKG_CONFIG_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib/pkgconfig"
else
  if [[ -n "$PKG_CONFIG_PATH" ]]; then
    PKG_CONFIG_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib/pkgconfig:$PKG_CONFIG_PATH"
  else
    PKG_CONFIG_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib/pkgconfig"
  fi
fi

# WARNING: overwriting PATH can be very dangerous
#   In Docker builds this must follow the pattern:
#     PATH="<desired addition to path>:$PATH"
#     Curly braces around PATH, like ${PATH} may pull from the host's PATH
# Please see StackOverflow answer: https://stackoverflow.com/a/38742545
if [[ ! -v PATH ]]; then
  PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/bin"
else
  if [[ -n "$PATH" ]]; then
    PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/bin:$PATH"
  else
    PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/bin"
  fi
fi

# Function to clean up multiple installation flag files with a given prefix
clean_install_flags() {
  local install_path="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
  local prefix="$1" # The first argument is now the prefix

  # Validate that a prefix was provided
  if [ -z "$prefix" ]; then
    echo "Error: No prefix provided for clean_install_flags." >&2
    return 1 # Indicate an error
  fi

  # Count files matching the pattern
  local count=$(find "${install_path}" -maxdepth 1 -type f -name "${prefix}*" 2>/dev/null | wc -l)

  if [ "${count}" -gt 1 ]; then
    echo "Warning: Found ${count} installation flag files with prefix '${prefix}'. Cleaning up..."
    # Remove all files matching the pattern
    find "${install_path}" -maxdepth 1 -type f -name "${prefix}*" -delete
    echo "Removed all existing installation flag files with prefix '${prefix}'."
  fi
}

install_python() {
  local original_dir=$(pwd)

  local PYTHON_FLAG_PREFIX=".python_installed-"
  clean_install_flags "$PYTHON_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${PYTHON_FLAG_PREFIX}${DATAFED_PYTHON_VERSION}" ]; then
    local original_dir=$(pwd)

    # Check if openssl is already installed, otherwise error since openssl is required
    local OPENSSL_FLAG_PREFIX=".openssl_installed-"
    if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${OPENSSL_FLAG_PREFIX}${DATAFED_OPENSSL}" ]; then
      echo "You must first install openssl before installing python"
      exit 1
    fi

    cd "${PROJECT_ROOT}"
    "$SUDO_CMD" apt update
    "$SUDO_CMD" apt install -y build-essential libreadline-dev zlib1g-dev libffi-dev wget libsqlite3-dev

    wget "https://www.python.org/ftp/python/${DATAFED_PYTHON_VERSION_FULL}/Python-${DATAFED_PYTHON_VERSION_FULL}.tgz"
    tar -xf "Python-${DATAFED_PYTHON_VERSION_FULL}.tgz"
    cd "Python-${DATAFED_PYTHON_VERSION_FULL}" 

    export CPPFLAGS="-I${DATAFED_DEPENDENCIES_INSTALL_PATH}/include $CPPFLAGS"
    export LDFLAGS="-L${DATAFED_DEPENDENCIES_INSTALL_PATH}/lib -Wl,-rpath,${DATAFED_DEPENDENCIES_INSTALL_PATH}/lib $LDFLAGS"
    ./configure --prefix="${DATAFED_PYTHON_DEPENDENCIES_DIR}" --with-openssl="${DATAFED_DEPENDENCIES_INSTALL_PATH}" --with-openssl-rpath=auto --enable-loadable-sqlite-extensions
    make -j$(nproc)
    make altinstall

    mkdir -p "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin"
    # Delete link if it exists
    rm -rf "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/python${DATAFED_PYTHON_VERSION}"
    ln -s "${DATAFED_PYTHON_DEPENDENCIES_DIR}/bin/python${DATAFED_PYTHON_VERSION}" "${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/python${DATAFED_PYTHON_VERSION}"
    export PYTHON="${DATAFED_PYTHON_DEPENDENCIES_DIR}/bin/python${DATAFED_PYTHON_VERSION}"

    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${PYTHON_FLAG_PREFIX}${DATAFED_PYTHON_VERSION}"
    cd "$original_dir"
  else
    echo "Python already installed, skipping..."
  fi
}

init_python() {

  if [[ ! -v DATAFED_PYTHON_DEPENDENCIES_DIR ]]; then
    echo "DATAFED_PYTHON_DEPENDENCIES_DIR is not defined please make sure it is defined in the ${PROJECT_ROOT}/config/datafed.sh file."
    exit 1
  else
    if [[ -z "$DATAFED_PYTHON_DEPENDENCIES_DIR" ]]; then
      echo "DATAFED_PYTHON_DEPENDENCIES_DIR is defined but is empty please make sure it is defined in ${PROJECT_ROOT}/config/datafed.sh file."
      exit 1
    fi
  fi

  if [ ! -e "$DATAFED_DEPENDENCIES_INSTALL_PATH" ] || [ ! -d "$DATAFED_PYTHON_DEPENDENCIES_DIR" ]; then
      mkdir -p "$DATAFED_PYTHON_DEPENDENCIES_DIR"
  fi

  "python${DATAFED_PYTHON_VERSION}" -m venv "${DATAFED_PYTHON_ENV}"
  # Make sure that pip is installed and upgraded
  "python${DATAFED_PYTHON_VERSION}" -m ensurepip --upgrade
}

install_cmake() {

  local CMAKE_FLAG_PREFIX=".cmake_installed-"
  clean_install_flags "$CMAKE_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${CMAKE_FLAG_PREFIX}${DATAFED_CMAKE_VERSION}" ]; then
    # Version 3.20 of cmake and onwards starting using all lower case in the package names, previos versions use a
    # a capital L in the name.
    wget https://github.com/Kitware/CMake/releases/download/v${DATAFED_CMAKE_VERSION}/cmake-${DATAFED_CMAKE_VERSION}-linux-x86_64.tar.gz
    tar -xzvf "cmake-${DATAFED_CMAKE_VERSION}-linux-x86_64.tar.gz" >/dev/null 2>&1
    cp -r "cmake-${DATAFED_CMAKE_VERSION}-linux-x86_64/bin" "${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cp -r "cmake-${DATAFED_CMAKE_VERSION}-linux-x86_64/share" "${DATAFED_DEPENDENCIES_INSTALL_PATH}"

    # Cleanup
    rm -rf "cmake-${DATAFED_CMAKE_VERSION}-linux-x86_64"
    rm -rf "cmake-${DATAFED_CMAKE_VERSION}-linux-x86_64.tar.gz"

    # Mark cmake as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${CMAKE_FLAG_PREFIX}${DATAFED_CMAKE_VERSION}"
  fi
  # WARNING: overwriting PATH can be very dangerous
  #   In Docker builds this must follow the pattern:
  #     PATH="<desired addition to path>:$PATH"
  #     Curly braces around PATH, like ${PATH} may pull from the host's PATH
  # Please see StackOverflow answer: https://stackoverflow.com/a/38742545
  export PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin:$PATH"
}

install_protobuf() {
  local PROTOBUF_FLAG_PREFIX=".protobuf_installed-"
  clean_install_flags "$PROTOBUF_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${PROTOBUF_FLAG_PREFIX}${DATAFED_PROTOBUF_VERSION}" ]; then
    local original_dir=$(pwd)
    cd "${PROJECT_ROOT}"
    if [ -d "${PROJECT_ROOT}/external/protobuf" ]
    then
      # sudo required because of egg file
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/protobuf"
    fi
    # Here we are using clone instead of submodule update, because submodule
    # requires the .git folder exist and the current folder be considered a repo
    # this creates problems in docker because each time a commit is made the 
    # .git folder contents are changed causing a fresh rebuild of all containers
    git clone "https://github.com/protocolbuffers/protobuf.git" \
      "${PROJECT_ROOT}/external/protobuf"

    cd "${PROJECT_ROOT}/external/protobuf"
    git checkout "v${DATAFED_PROTOBUF_VERSION}"
    git submodule update --init --recursive
    # Build static library, cannot build shared library at same time apparently
    # there cannot be a shared libsodium file in the
    # DATAFED_DEPENDENCIES_INSTALL_PREFIX if you want to have everything static
    # libzmq picks up any shared file regardless of whether you have told it to 
    # only use static libraries or not.
    # NOTE - static libraries must be built first
    cmake -S . -B build \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DBUILD_SHARED_LIBS=OFF \
      -Dprotobuf_BUILD_TESTS=OFF \
      -DABSL_PROPAGATE_CXX_STD=ON \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi
    # Build Shared library
    # Don't build shared, it messes up the static library linking because the
    # cmake file installed are not compatible
    # WARNING - static library will break if build with shared options on

    cd python
    init_python
    source "${DATAFED_PYTHON_ENV}/bin/activate"
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" PATH="$PATH" python${DATAFED_PYTHON_VERSION} -m pip install numpy tzdata
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" PATH="$PATH" python${DATAFED_PYTHON_VERSION} setup.py build
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" PATH="$PATH" python${DATAFED_PYTHON_VERSION} setup.py test
    # Because we have activaited a venv we don't want to use the --user flag
    # with the install command
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" PATH="$PATH" "python${DATAFED_PYTHON_VERSION}" setup.py install
    cd ../
    # Cleanup build file with root ownership
    if [ -f build/install_manifest.txt ]
    then
      "$SUDO_CMD" rm build/install_manifest.txt
    fi
    cd "${PROJECT_ROOT}"

    # Mark protobuf as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${PROTOBUF_FLAG_PREFIX}${DATAFED_PROTOBUF_VERSION}"
    cd "$original_dir"
  fi
}

install_libsodium() {
  local LIBSODIUM_FLAG_PREFIX=".libsodium_installed-"
  clean_install_flags "$LIBSODIUM_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${LIBSODIUM_FLAG_PREFIX}${DATAFED_LIBSODIUM_VERSION}" ]; then
    local original_dir=$(pwd)
    if [ -d "${PROJECT_ROOT}/external/libsodium" ]
    then
      # sudo required because of egg file
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/libsodium"
    fi
    # Official documentation for libsodium indicates this is the preferred way to build libsodium.
    # Using the git repo directly results in build instability because of additional network calls when running
    # autogen.sh.
    wget "https://download.libsodium.org/libsodium/releases/libsodium-${DATAFED_LIBSODIUM_VERSION}.tar.gz" -P "${PROJECT_ROOT}/external"
    tar -xvzf "${PROJECT_ROOT}/external/libsodium-${DATAFED_LIBSODIUM_VERSION}.tar.gz" -C "${PROJECT_ROOT}/external/"
    cd "${PROJECT_ROOT}/external/libsodium-${DATAFED_LIBSODIUM_VERSION}"
    # Build static ONLY!!!!
    # Note if zmq detects a shared sodium library it will grab it no matter what
    # --enable-shared=no must be set here
    SODIUM_STATIC=1 ./configure --enable-static=yes --enable-shared=no --with-pic=yes --prefix="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    make -j 8
    make check
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      make install
    else
      "$SUDO_CMD" make install
    fi

    # Mark libsodium as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${LIBSODIUM_FLAG_PREFIX}${DATAFED_LIBSODIUM_VERSION}"
    cd "$original_dir"
  fi
}

install_libzmq() {
  local LIBZMQ_FLAG_PREFIX=".libzmq_installed-"
  clean_install_flags "$LIBZMQ_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${LIBZMQ_FLAG_PREFIX}${DATAFED_LIBZMQ_VERSION}" ]; then
    local original_dir=$(pwd)
    if [ -d "${PROJECT_ROOT}/external/libzmq" ]
    then
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/libzmq"
    fi
    if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.libsodium_installed-${DATAFED_LIBSODIUM_VERSION}" ]; then
      echo "You must first install libsodium before installing libzmq"
      exit 1
    fi
    # Here we are using clone instead of submodule update, because submodule
    # requires the .git folder exist and the current folder be considered a repo
    # this creates problems in docker because each time a commit is made the 
    # .git folder contents are changed causing a fresh rebuild of all containers
    git clone https://github.com/zeromq/libzmq.git "${PROJECT_ROOT}/external/libzmq"
    cd "${PROJECT_ROOT}/external/libzmq"
    git checkout "v${DATAFED_LIBZMQ_VERSION}"
    # Build static only
    cmake -S. -B build \
      -DBUILD_STATIC=ON \
      -DBUILD_SHARED_LIBS=OFF \
      -DBUILD_SHARED=OFF \
      -DWITH_LIBSODIUM_STATIC=ON \
      -DBUILD_TESTS=OFF \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DCMAKE_PREFIX_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}/lib" \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi

    if [ -d "${PROJECT_ROOT}/external/cppzmq" ]
    then
      # sudo required because of egg file
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/cppzmq"
    fi
    git clone https://github.com/zeromq/cppzmq.git "${PROJECT_ROOT}/external/cppzmq"
    cd "${PROJECT_ROOT}/external/cppzmq"
    git checkout v"${DATAFED_LIB_ZMQCPP_VERSION}"
    # Will will not build the unit tests because there are not enough controls
    # to link to the correct static library.
    # NOTE - static libraries must be built first
    cmake -S. -B build \
      -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DCPPZMQ_BUILD_TESTS=OFF \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi

    cd "$original_dir"
    # Mark libzmq as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${LIBZMQ_FLAG_PREFIX}${DATAFED_LIBZMQ_VERSION}"
  fi
}

install_nlohmann_json() {
  local NLOHMANN_FLAG_PREFIX=".nlohmann_json_installed-"
  clean_install_flags "$NLOHMANN_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NLOHMANN_FLAG_PREFIX}${DATAFED_NLOHMANN_JSON_VERSION}" ]; then
    local original_dir=$(pwd)
    if [ -d "${PROJECT_ROOT}/external/json" ]
    then
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/json"
    fi
    git clone https://github.com/nlohmann/json.git "${PROJECT_ROOT}/external/json"
    cd "${PROJECT_ROOT}/external/json"
    git checkout v${DATAFED_NLOHMANN_JSON_VERSION}
    echo "FILE STRUCTURE $(ls)"
    # Build static
    cmake -S . -B build \
      -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi
    # Build shared
    cmake -S . -B build \
      -DBUILD_SHARED_LIBS=ON \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi

    # Mark nlohmann_json as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NLOHMANN_FLAG_PREFIX}${DATAFED_NLOHMANN_JSON_VERSION}"
    cd "$original_dir"
  fi
}

install_json_schema_validator() {
  local NLOHMANN_SCHEMA_FLAG_PREFIX=".nlohmann_schema_validator_installed-"
  clean_install_flags "$NLOHMANN_SCHEMA_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NLOHMANN_SCHEMA_FLAG_PREFIX}${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}" ]; then
    local original_dir=$(pwd)
    if [ -d "${PROJECT_ROOT}/external/json-schema-validator" ]
    then
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/json-schema-validator"
    fi
    git clone https://github.com/pboettch/json-schema-validator "${PROJECT_ROOT}/external/json-schema-validator"
    cd "${PROJECT_ROOT}/external/json-schema-validator"
    git checkout ${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}
    # Build static
    cmake -S . -B build \
      -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi
    # WARNING building shared library will overwrite cmake file for static
    # library, does not appear to support both targets at the same time, similar
    # to protobuf
    # Mark json-schema-validator as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NLOHMANN_SCHEMA_FLAG_PREFIX}${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}"
    cd "$original_dir"
  fi
}

install_gcs() {
  local GCS_FLAG_PREFIX=".gcs_installed-"
  clean_install_flags "$GCS_FLAG_PREFIX"
  if [ ! -e "${GCS_FLAG_PREFIX}${DATAFED_GLOBUS_VERSION}" ]; then
    "$SUDO_CMD" apt update
    "$SUDO_CMD" apt install -y curl git gnupg
    curl -LOs \
    "https://downloads.globus.org/globus-connect-server/stable/installers/repo/deb/globus-repo_${DATAFED_GLOBUS_VERSION}_all.deb"
    "$SUDO_CMD" dpkg -i "globus-repo_${DATAFED_GLOBUS_VERSION}_all.deb"
    "$SUDO_CMD" apt-key add /usr/share/globus-repo/RPM-GPG-KEY-Globus
    # Need a second update command after adding the globus GPG key
    "$SUDO_CMD" apt update
    "$SUDO_CMD" apt-get install globus-connect-server54 -y
    
    # Mark gcs as installed
    touch "${GCS_FLAG_PREFIX}${DATAFED_GLOBUS_VERSION}"
  fi
}

install_nvm() {
  local NVM_FLAG_PREFIX=".nvm_installed-"
  clean_install_flags "$NVM_FLAG_PREFIX"
  # By default this will place NVM in $HOME/.nvm
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NVM_FLAG_PREFIX}${DATAFED_NVM_VERSION}" ]; then
    # By setting NVM_DIR beforehand when the scirpt is run it
    # will use it to set the install path
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    mkdir -p "${NVM_DIR}"
    # --fail makes curl return a non-zero exit code for HTTP errors like 404 or 500.
    curl --fail -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${DATAFED_NVM_VERSION}/install.sh" | bash
    # Mark nvm as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NVM_FLAG_PREFIX}${DATAFED_NVM_VERSION}"
  else
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
  fi
}

install_ws_node_packages() {

  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nvm_installed-${DATAFED_NVM_VERSION}" ]; then
    echo "You must first install nvm before installing ws node packages."
    exit 1
  fi
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.node_installed-${DATAFED_NODE_VERSION}" ]; then
    echo "You must first install node before installing ws node packages"
    exit 1
  fi
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.cmake_installed-${DATAFED_CMAKE_VERSION}" ]; then
    echo "You must first install cmake before installing ws node packages"
    exit 1
  fi

  # Configure the package.json.in file -> package.json
  cmake -P "${PROJECT_ROOT}/cmake/Web.cmake"
  export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
  export NODE_VERSION="$DATAFED_NODE_VERSION"
  "$NVM_DIR/nvm-exec" npm --prefix "${PROJECT_ROOT}/web" install "${PROJECT_ROOT}/web"
}


install_node() {
  local NODE_FLAG_PREFIX=".node_installed-"
  clean_install_flags "$NODE_FLAG_PREFIX"
  # By default this will place NVM in $HOME/.nvm
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NODE_FLAG_PREFIX}${DATAFED_NODE_VERSION}" ]; then
    local original_dir=$(pwd)
    if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nvm_installed-${DATAFED_NVM_VERSION}" ]; then
      echo "You must first install nvm before installing node."
      exit 1
    fi

    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"

    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    nvm install "$DATAFED_NODE_VERSION"
    nvm use "$DATAFED_NODE_VERSION"
    # Mark node as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${NODE_FLAG_PREFIX}${DATAFED_NODE_VERSION}"
    cd "$original_dir"
  else
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    # Used by nvm
    export NODE_VERSION="$DATAFED_NODE_VERSION"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    nvm use "$DATAFED_NODE_VERSION"
  fi
  echo "NODE VERSION USED/INSTALLED $DATAFED_NODE_VERSION"
}

install_foxx_cli() {
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nvm_installed-${DATAFED_NVM_VERSION}" ]; then
    echo "You must first install nvm before installing foxx_cli."
    exit 1
  fi
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.node_installed-${DATAFED_NODE_VERSION}" ]; then
    echo "You must first install node before installing foxx_cli"
    exit 1
  fi
  local FOXX_FLAG_PREFIX=".foxx_cli_installed-"
  clean_install_flags "$FOXX_FLAG_PREFIX"
  # By default this will place NVM in $HOME/.nvm
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${FOXX_FLAG_PREFIX}" ]; then
    local original_dir=$(pwd)
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    export NODE_VERSION="$DATAFED_NODE_VERSION"
    "$NVM_DIR/nvm-exec" npm install --global foxx-cli --prefix "${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm"
    # Mark foxx_cli as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${FOXX_FLAG_PREFIX}"
    cd "$original_dir"
  else
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    export NODE_VERSION="$DATAFED_NODE_VERSION"

    # check that foxx can be found
    if [ ! -d "${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm" ]
    then
	echo "Something went wrong Foxx is supposed to be installed i.e. "
	echo "(${DATAFED_DEPENDENCIES_INSTALL_PATH}/.foxx_cli_installed) "
	echo "exists. But there is no npm folder in: ${DATAFED_DEPENDENCIES_INSTALL_PATH}"
	exit 1
    fi
    if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm/bin/foxx" ]
    then
	echo "Something went wrong Foxx is supposed to be installed i.e. "
	echo "(${DATAFED_DEPENDENCIES_INSTALL_PATH}/.foxx_cli_installed) "
	echo "exists. But there is no foxx binary here: ${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm/bin/foxx"
	exit 1
    fi
  fi
}

install_arangodb() {
  curl -OL https://download.arangodb.com/arangodb312/DEBIAN/Release.key
  "$SUDO_CMD" apt-key add - < Release.key
  echo 'deb https://download.arangodb.com/arangodb312/DEBIAN/ /' | "$SUDO_CMD" tee /etc/apt/sources.list.d/arangodb.list
  "$SUDO_CMD" apt-get install apt-transport-https
  "$SUDO_CMD" apt-get update
  "$SUDO_CMD" apt-get install arangodb3
}

install_openssl() {
  local OPENSSL_FLAG_PREFIX=".openssl_installed-"
  clean_install_flags "$OPENSSL_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${OPENSSL_FLAG_PREFIX}${DATAFED_OPENSSL}" ]; then
    local original_dir=$(pwd)
    if [ -d "${PROJECT_ROOT}/external/openssl" ]
    then
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/openssl"
    fi

    "$SUDO_CMD" apt update
    "$SUDO_CMD" apt install -y build-essential git

    git clone https://github.com/openssl/openssl "${PROJECT_ROOT}/external/openssl"
    cd "${PROJECT_ROOT}/external/openssl"
    git checkout "$DATAFED_OPENSSL_COMMIT"
    ./config --prefix="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    make -j 8

    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      make install
    else
      "$SUDO_CMD" make install
    fi

    # Mark openssl as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${OPENSSL_FLAG_PREFIX}${DATAFED_OPENSSL}"
    cd "$original_dir"
  else
    echo "OpenSSL already installed, skipping..."
  fi
}

install_libcurl() {
  local CURL_FLAG_PREFIX=".libcurl_installed-"
  clean_install_flags "$CURL_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${CURL_FLAG_PREFIX}${DATAFED_LIBCURL}" ]; then
    local original_dir=$(pwd)
    if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.zlib_installed-${DATAFED_ZLIB_VERSION}" ]; then
      echo "You must first install zlib before installing libcurl packages"
      exit 1
    fi
    if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.openssl_installed-${DATAFED_OPENSSL}" ]; then
      echo "You must first install OpenSSL before installing libcurl packages"
      exit 1
    fi
    if [ -d "${PROJECT_ROOT}/external/libcurl" ]
    then
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/libcurl"
    fi
    wget "${DATAFED_LIBCURL_URL}"
    mkdir -p "${PROJECT_ROOT}/external/libcurl"
    tar -xf "curl-${DATAFED_LIBCURL}.tar.gz" -C "${PROJECT_ROOT}/external/libcurl"
    cd "${PROJECT_ROOT}/external/libcurl/curl-${DATAFED_LIBCURL}"

    # Making third party features and dependencies explicit
    # OpenSSL is needed for HTTPS encryption
    # File - allows caching requires libc
    # GNUTLS - HTTPS support session management certificate verification etc
    # NOTE: NSS - Network Security Services for HTTP support is deprecated
    # NOTE: metalink - is no longer supported and not a valid argument
    PKG_CONFIG_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}/lib/pkgconfig" \
    ./configure --with-ssl="${DATAFED_DEPENDENCIES_INSTALL_PATH}" --with-gnutls --with-zlib \
      --enable-file --disable-shared \
      --disable-ldap --disable-ldaps --disable-rtsp --disable-dict \
      --disable-telnet --disable-tftp --disable-pop3 --disable-imap \
      --disable-smtp  --disable-gopher --disable-smb --disable-ftp \
      --disable-file --disable-sspi --without-zstd --without-libidn2 --without-librtmp \
      --without-winidn --without-libpsl \
      --without-libssh2 --without-nghttp2 --without-brotli \
      --without-libidn --without-libbrotli \
      --prefix="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    make -j 8

    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      make install
    else
      "$SUDO_CMD" make install 
    fi

    # Mark libcurl as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${CURL_FLAG_PREFIX}${DATAFED_LIBCURL}"
    cd "$original_dir"
  fi
}

install_zlib() {
  local ZLIB_FLAG_PREFIX=".zlib_installed-"
  clean_install_flags "$ZLIB_FLAG_PREFIX"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${ZLIB_FLAG_PREFIX}${DATAFED_ZLIB_VERSION}" ]; then
    local original_dir=$(pwd)
    if [ -d "${PROJECT_ROOT}/external/zlib" ]
    then
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/zlib"
    fi
    wget "${DATAFED_ZLIB_URL}"
    mkdir -p "${PROJECT_ROOT}/external/zlib"
    tar -xf "zlib-${DATAFED_ZLIB_VERSION}.tar.gz" -C "${PROJECT_ROOT}/external/zlib"
    cd "${PROJECT_ROOT}/external/zlib/zlib-${DATAFED_ZLIB_VERSION}"
    PKG_CONFIG_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}/lib/pkgconfig" ./configure --prefix="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    make -j 8

    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      make install
    else
      "$SUDO_CMD" make install
    fi

    # Mark libcurl as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/${ZLIB_FLAG_PREFIX}${DATAFED_ZLIB_VERSION}"
    cd "$original_dir"
  fi
}

install_dep_by_name() {
  case "$1" in
    "cmake")
      install_cmake
      ;;
    "foxx")
      install_foxx_cli
      ;;
    "protobuf")
      install_protobuf
      ;;
    "nlohmann_json")
      install_nlohmann_json
      ;;
    "json_schema_validator")
      install_json_schema_validator
      ;;
    "gcs")
      install_gcs
      ;;
    "libsodium")
      install_libsodium
      ;;
    "libzmq")
      install_libzmq
      ;;
    "libopenssl")
      install_openssl
      ;;
    "libcurl")
      install_libcurl
      ;;
    "zlib")
      install_zlib
      ;;
    "nvm")
      install_nvm
      ;;
    "node")
      install_node
      ;;
    "ws_node_packages")
      install_ws_node_packages
      ;;
    "python")
      install_python
      ;;
  esac
  cd ~
}
