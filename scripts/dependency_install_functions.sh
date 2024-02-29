#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
source "${SOURCE}/dependency_versions.sh"
PROJECT_ROOT=$(realpath "${SOURCE}/..")
source "${SOURCE}/utils.sh"

sudo_command
# these are the dependencies to be installed by apt
apt_file_path="${PROJECT_ROOT}/tmp/apt_deps"
# these are the dependencies to be installed and built via cmake
ext_file_path="${PROJECT_ROOT}/tmp/ext_deps"

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

LD_LIBRARY_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib:$LD_LIBRARY_PATH"

install_cmake() {
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.cmake_installed-${DATAFED_CMAKE_VERSION}" ]; then
    wget https://github.com/Kitware/CMake/releases/download/v${DATAFED_CMAKE_VERSION}/cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz
    tar -xzvf cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz
    cp -r "cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64/bin" "${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cp -r "cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64/share" "${DATAFED_DEPENDENCIES_INSTALL_PATH}"

    # Cleanup
    rm -rf "cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64"
    rm -rf "cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz"

    # Mark cmake as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.cmake_installed-${DATAFED_CMAKE_VERSION}"
  fi
  export PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin:${PATH}"
}

install_protobuf() {
  local original_dir=$(pwd)
  cd "${PROJECT_ROOT}"
  echo "PROJECT_ROOT $PROJECT_ROOT"
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.protobuf_installed-${DATAFED_PROTOBUF_VERSION}" ]; then
    if [ -d "${PROJECT_ROOT}/external/protobuf" ]
    then
      # sudo required because of egg file
      "$SUDO_CMD" rm -rf "${PROJECT_ROOT}/external/protobuf"
    fi
    git submodule update --init --recursive "${PROJECT_ROOT}/external/protobuf"
    cd "${PROJECT_ROOT}/external/protobuf"
    git checkout "v${DATAFED_PROTOBUF_VERSION}"
    git submodule update --init --recursive
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
    cd python
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 -m pip install numpy
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 setup.py build
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 setup.py test
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 setup.py install --user
    python3 setup.py build
    python3 setup.py install --user
    cd ../
    # Cleanup build file with root ownership
    if [ -f build/install_manifest.txt ]
    then
      "$SUDO_CMD" rm build/install_manifest.txt
    fi
    cd "${PROJECT_ROOT}"

    # Mark protobuf as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.protobuf_installed-${DATAFED_PROTOBUF_VERSION}"
  fi
  cd "$original_dir"
}

install_libsodium() {
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.libsodium_installed-${DATAFED_LIBSODIUM_VERSION}" ]; then
    if [ -d libsodium ]
    then
      rm -rf libsodium 
    fi
    #git clone --recursive https://github.com/robinlinden/libsodium-cmake.git
    #cd libsodium-cmake/libsodium
    #git checkout "$DATAFED_LIBSODIUM_VERSION"
    #cd ../
    #cmake -DBUILD_SHARED_LIBS=OFF -S. -B build \
    #  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    #  -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    #cmake --build build -j 8
    #if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
    #  cmake --build build --target install
    #else
    #  "$SUDO_CMD" cmake --build build --target install
    #fi

    git clone https://github.com/jedisct1/libsodium.git
    cd libsodium
    git checkout "$DATAFED_LIBSODIUM_VERSION"
    ./autogen.sh
    SODIUM_STATIC=1 ./configure --enable-static=yes --enable-shared=no --prefix="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    make check
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      make install
    else
      "$SUDO_CMD" make install
    fi
    cd ../
    
    # Mark libsodium as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.libsodium_installed-${DATAFED_LIBSODIUM_VERSION}"
  fi
}

install_libzmq() {
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.libzmq_installed-${DATAFED_LIBZMQ_VERSION}" ]; then
    if [ -d libzmq ]
    then
      rm -rf libzmq 
    fi
    if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.libsodium_installed-${DATAFED_LIBSODIUM_VERSION}" ]; then
      echo "You must first install libsodium before installing libzmq"
      exit 1
    fi
    git clone https://github.com/zeromq/libzmq.git
    cd libzmq
    git checkout "v${DATAFED_LIBZMQ_VERSION}"
    cmake -S. -B build \
      -DBUILD_STATIC=ON \
      -DBUILD_SHARED_LIBS=OFF \
      -DBUILD_SHARED=OFF \
      -DWITH_LIBSODIUM_STATIC=ON \
      -DBUILD_TESTS=OFF \
      -DCMAKE_PREFIX_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}/lib" \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi
    cd ../ 

    if [ -d cppzmq ]
    then
      rm -rf cppzmq
    fi
    git clone https://github.com/zeromq/cppzmq.git
    cd cppzmq
    git checkout v"${DATAFED_LIB_ZMQCPP_VERSION}"
    # Will will not build the unit tests because there are not enough controls
    # to link to the correct static library.
    cmake -S. -B build \
      -DBUILD_SHARED_LIBS=OFF \
      -DCPPZMQ_BUILD_TESTS=OFF \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi
    
    # Mark libzmq as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.libzmq_installed-${DATAFED_LIBZMQ_VERSION}"
  fi
}

install_nlohmann_json() {
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nlohmann_json_installed-${DATAFED_NLOHMANN_JSON_VERSION}" ]; then
    if [ -d json ]
    then
      rm -rf json
    fi
    git clone https://github.com/nlohmann/json.git
    cd json
    git checkout v${DATAFED_NLOHMANN_JSON_VERSION}
    echo "FILE STRUCTURE $(ls)"
    cmake -S . -B build \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi
    cd ../
    
    # Mark nlohmann_json as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nlohmann_json_installed-${DATAFED_NLOHMANN_JSON_VERSION}"
  fi
}

install_json_schema_validator() {
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.json_schema_validator_installed-${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}" ]; then
    if [ -d json-schema-validator ]
    then
      rm -rf json-schema-validator
    fi
    git clone https://github.com/pboettch/json-schema-validator
    cd json-schema-validator
    git checkout ${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}
    cmake -S . -B build \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    if [ -w "${DATAFED_DEPENDENCIES_INSTALL_PATH}" ]; then
      cmake --build build --target install
    else
      "$SUDO_CMD" cmake --build build --target install
    fi
    cd ../
    
    # Mark json-schema-validator as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.json_schema_validator_installed-${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}"
  fi
}

install_gcs() {
  if [ ! -e ".gcs_installed-${DATAFED_GLOBUS_VERSION}" ]; then
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
    touch ".gcs_installed-${DATAFED_GLOBUS_VERSION}"
  fi
}

install_nvm() {
  # By default this will place NVM in $HOME/.nvm
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nvm_installed-${DATAFED_NVM_VERSION}" ]; then
    # By setting NVM_DIR beforehand when the scirpt is run it 
    # will use it to set the install path
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    mkdir -p "${NVM_DIR}"
    curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${DATAFED_NVM_VERSION}/install.sh" | bash
    # Mark nvm as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nvm_installed-${DATAFED_NVM_VERSION}"
  else
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
  fi
}

install_node() {
  # By default this will place NVM in $HOME/.nvm
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.nvm_installed-${DATAFED_NVM_VERSION}" ]; then
    echo "You must first install nvm before installing node."
    exit 1
  fi
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.node_installed-${DATAFED_NODE_VERSION}" ]; then

    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"

    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    nvm install "$DATAFED_NODE_VERSION"
    # Mark node as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.node_installed-${DATAFED_NODE_VERSION}"
  else
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
  fi
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
  # By default this will place NVM in $HOME/.nvm
  if [ ! -e "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.foxx_cli_installed" ]; then
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    export NODE_VERSION="$DATAFED_NODE_VERSION"
    "$NVM_DIR/nvm-exec" npm install --global foxx-cli --prefix "${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm"
    # Mark foxx_cli as installed
    touch "${DATAFED_DEPENDENCIES_INSTALL_PATH}/.foxx_cli_installed"
  else
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    export NODE_VERSION="$DATAFED_NODE_VERSION"
  fi
}

install_arangodb() {
  curl -OL https://download.arangodb.com/arangodb38/DEBIAN/Release.key
  "$SUDO_CMD" apt-key add - < Release.key
  echo 'deb https://download.arangodb.com/arangodb38/DEBIAN/ /' | "$SUDO_CMD" tee /etc/apt/sources.list.d/arangodb.list
  "$SUDO_CMD" apt-get install apt-transport-https
  "$SUDO_CMD" apt-get update
  "$SUDO_CMD" apt-get install arangodb3
}

install_dep_by_name() {
  case "$1" in
    "cmake")
      install_cmake
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
  esac
  cd ~
}
