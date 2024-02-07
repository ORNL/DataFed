#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
source "${SOURCE}/dependency_versions.sh"
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# these are the dependencies to be installed by apt
apt_file_path="/tmp/apt_deps"
# these are the dependencies to be installed and built via cmake
ext_file_path="/tmp/ext_deps"

if [ ! -e "${PROJECT_ROOT}/config/datafed.sh" ]
then
  echo "Please run generate_datafed.sh before installing dependencies"
  exit 1
fi

source "${PROJECT_ROOT}/config/datafed.sh"

if [ ! -e "$DATAFED_DEPENDENCIES_INSTALL_PATH" ] || [ ! -d "$DATAFED_DEPENDENCIES_INSTALL_PATH" ]; then
    mkdir -p "$DATAFED_DEPENDENCIES_INSTALL_PATH"
fi

LD_LIBRARY_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH/lib:$LD_LIBRARY_PATH"


install_cmake() {
  if [ ! -e ".cmake_installed-${DATAFED_CMAKE_VERSION}" ]; then
    wget https://github.com/Kitware/CMake/releases/download/v${DATAFED_CMAKE_VERSION}/cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz
    tar -xzvf cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz
    cp -r cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64/bin "${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cp -r cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64/share "${DATAFED_DEPENDENCIES_INSTALL_PATH}"

    # Cleanup
    rm -rf cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64 
    rm -rf cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz

    # Mark cmake as installed
    touch ".cmake_installed-${DATAFED_CMAKE_VERSION}"
  fi
}

install_protobuf() {
  local original_dir=$(pwd)
  cd "${PROJECT_ROOT}"
  echo "PROJECT_ROOT $PROJECT_ROOT"
  if [ ! -e ".protobuf_installed-${DATAFED_PROTOBUF_VERSION}" ]; then
    if [ -d "${PROJECT_ROOT}/external/protobuf" ]
    then
      # sudo required because of egg file
      sudo rm -rf "${PROJECT_ROOT}/external/protobuf"
    fi
    git submodule update --init "${PROJECT_ROOT}/external/protobuf"
    cd "${PROJECT_ROOT}/external/protobuf"
    git checkout "v${DATAFED_PROTOBUF_VERSION}"
    git submodule update --init --recursive
    cmake -S . -B build \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DBUILD_SHARED_LIBS=ON \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    sudo cmake --build build --target install
    cd python
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 -m pip install numpy
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 setup.py build
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 setup.py test
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH" python3 setup.py install --user
    cd ../
    # Cleanup build file with root ownership
    if [ -f build/install_manifest.txt ]
    then
      sudo rm build/install_manifest.txt
    fi
    cd "${PROJECT_ROOT}"

    # Mark protobuf as installed
    touch ".protobuf_installed-${DATAFED_PROTOBUF_VERSION}"
  fi
  cd "$original_dir"
}

install_libsodium() {
  if [ ! -e ".libsodium_installed-${DATAFED_LIBSODIUM_VERSION}" ]; then
    if [ -d libsodium ]
    then
      rm -rf libsodium 
    fi
    git clone https://github.com/jedisct1/libsodium.git
    cd libsodium
    git checkout "$DATAFED_LIBSODIUM_VERSION"
    ./autogen.sh
    ./configure --prefix="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    make check
    sudo make install
    sudo ldconfig
    cd ../
    
    # Mark libsodium as installed
    touch ".libsodium_installed-${DATAFED_LIBSODIUM_VERSION}"
  fi
}

install_libzmq() {
  if [ ! -e ".libzmq_installed-${DATAFED_LIBZMQ_VERSION}" ]; then
    if [ -d libzmq ]
    then
      rm -rf libzmq 
    fi
    git clone https://github.com/zeromq/libzmq.git
    cd libzmq
    git checkout v${DATAFED_LIBZMQ_VERSION}
    cmake -S. -B build \
      -DBUILD_STATIC=ON \
      -DBUILD_SHARED=ON \
      -DCMAKE_INSTALL_PREFIX="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
    cmake --build build -j 8
    sudo cmake --build build --target install
    
    # Mark libzmq as installed
    touch ".libzmq_installed-${DATAFED_LIBZMQ_VERSION}"
  fi
}

install_nlohmann_json() {
  if [ ! -e ".nlohmann_json_installed-${DATAFED_NLOHMANN_JSON_VERSION}" ]; then
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
    sudo cmake --build build --target install
    cd ../
    
    # Mark nlohmann_json as installed
    touch ".nlohmann_json_installed-${DATAFED_NLOHMANN_JSON_VERSION}"
  fi
}

install_json_schema_validator() {
  if [ ! -e ".json_schema_validator_installed-${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}" ]; then
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
    sudo cmake --build build --target install
    cd ../
    
    # Mark json-schema-validator as installed
    touch ".json_schema_validator_installed-${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}"
  fi
}

install_gcs() {
  if [ ! -e ".gcs_installed-${DATAFED_GLOBUS_VERSION}" ]; then
    sudo apt update
    sudo apt install -y curl git gnupg
    curl -LOs https://downloads.globus.org/globus-connect-server/stable/installers/repo/deb/globus-repo_${DATAFED_GLOBUS_VERSION}_all.deb
    sudo dpkg -i globus-repo_${DATAFED_GLOBUS_VERSION}_all.deb
    sudo apt-key add /usr/share/globus-repo/RPM-GPG-KEY-Globus
    # Need a second update command after adding the globus GPG key
    sudo apt update
    sudo apt-get install globus-connect-server54 -y
    
    # Mark gcs as installed
    touch ".gcs_installed-${DATAFED_GLOBUS_VERSION}"
  fi
}

install_arangodb() {
  curl -OL https://download.arangodb.com/arangodb38/DEBIAN/Release.key
  sudo apt-key add - < Release.key
  echo 'deb https://download.arangodb.com/arangodb38/DEBIAN/ /' | sudo tee /etc/apt/sources.list.d/arangodb.list
  sudo apt-get install apt-transport-https
  sudo apt-get update
  sudo apt-get install arangodb3
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
