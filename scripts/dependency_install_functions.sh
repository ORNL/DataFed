#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
source "${SOURCE}/dependency_versions.sh"

install_cmake() {
  wget https://github.com/Kitware/CMake/releases/download/v${DATAFED_CMAKE_VERSION}/cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz
  tar -xzvf cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz
  cp -r cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64/bin /usr/local
  cp -r cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64/share /usr/local

  # Cleanup
  rm -rf cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64 
  rm -rf cmake-${DATAFED_CMAKE_VERSION}-Linux-x86_64.tar.gz
}

install_protobuf() {
  if [ -d protobuf ]
  then
    # sudo required because of egg file
    sudo rm -rf protobuf 
  fi
  git clone  https://github.com/google/protobuf.git
  cd protobuf
  git checkout v${DATAFED_PROTOBUF_VERSION}
  git submodule update --init --recursive
  cmake -S cmake/ -B build -DCMAKE_POSITION_INDEPENDENT_CODE=ON
  cmake --build build -j 8
  sudo cmake --build build --target install
  cd python
  python3 setup.py build
  python3 setup.py test
  sudo python3 setup.py install
  cd ../../
}

install_libsodium() {
  if [ -d libsodium ]
  then
    rm -rf libsodium 
  fi
  git clone https://github.com/jedisct1/libsodium.git
  cd libsodium
  git checkout "$DATAFED_LIBSODIUM_VERSION"
  ./autogen.sh
  ./configure
  make check
  sudo make install
  sudo ldconfig
  cd ../
}

install_libzmq() {
  if [ -d libzmq ]
  then
    rm -rf libzmq 
  fi
  git clone https://github.com/zeromq/libzmq.git
  cd libzmq
  git checkout v${DATAFED_LIBZMQ_VERSION}
  cmake -S. -B build -DBUILD_STATIC=ON -DBUILD_SHARED=ON
  cmake --build build -j 8
  sudo cmake --build build --target install
}

install_nlohmann_json() {
  if [ -d json ]
  then
    rm -rf json
  fi
  git clone https://github.com/nlohmann/json.git
  cd json
  git checkout v${DATAFED_NLOHMANN_JSON_VERSION}
  cmake -S . -B build
  cmake --build build -j 8
  sudo cmake --build build --target install
  cd ../
}

install_json_schema_validator() {
  if [ -d json-schema-validator ]
  then
    rm -rf json-schema-validator
  fi
  git clone https://github.com/pboettch/json-schema-validator
  cd json-schema-validator
  git checkout ${DATAFED_JSON_SCHEMA_VALIDATOR_VERSION}
  cmake -S . -B build
  cmake --build build -j 8
  sudo cmake --build build --target install
  cd ../
}

install_gcs() {
  sudo apt update
  sudo apt install -y curl git gnupg
  curl -LOs https://downloads.globus.org/globus-connect-server/stable/installers/repo/deb/globus-repo_${DATAFED_GLOBUS_VERSION}_all.deb
  sudo dpkg -i globus-repo_${DATAFED_GLOBUS_VERSION}_all.deb
  sudo apt-key add /usr/share/globus-repo/RPM-GPG-KEY-Globus
  # Need a second update command after adding the globus GPG key
  sudo apt update
  sudo apt-get install globus-connect-server54 -y
}
