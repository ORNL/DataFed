#!/bin/bash

install_cmake() {
  local cmake_version="3.17.5"
  wget https://github.com/Kitware/CMake/releases/download/v${cmake_version}/cmake-${cmake_version}-Linux-x86_64.tar.gz
  tar -xzvf cmake-${cmake_version}-Linux-x86_64.tar.gz
  cp -r cmake-${cmake_version}-Linux-x86_64/bin /usr/local
  cp -r cmake-${cmake_version}-Linux-x86_64/share /usr/local

  # Cleanup
  rm -rf cmake-${cmake_version}-Linux-x86_64 
  rm -rf cmake-${cmake_version}-Linux-x86_64.tar.gz
}

install_protobuf() {
  local protobuf_version="3.17.3"
  if [ -d protobuf ]
  then
    # sudo required because of egg file
    sudo rm -rf protobuf 
  fi
  git clone  https://github.com/google/protobuf.git
  cd protobuf
  git checkout v${protobuf_version}
  git submodule update --init --recursive
  cmake -S cmake/ -B build -DCMAKE_POSITION_INDEPENDENT_CODE=ON
  cmake --build build -j 4
  sudo cmake --build build --target install
  cd python
  python3 setup.py build
  python3 setup.py test
  sudo python3 setup.py install
  cd ../../
}

install_libsodium() {
  local libsodium_version="1.0.18"
  if [ -d libsodium ]
  then
    rm -rf libsodium 
  fi
  git clone https://github.com/jedisct1/libsodium.git
  cd libsodium
  git checkout "$libsodium_version"
  ./autogen.sh
  ./configure
  make check
  sudo make install
  sudo ldconfig
  cd ../
}

install_libzmq() {
  local libzmq_version="4.3.4"
  if [ -d libzmq ]
  then
    rm -rf libzmq 
  fi
  git clone https://github.com/zeromq/libzmq.git
  cd libzmq
  git checkout v${libzmq_version}
  cmake -S. -B build
  cmake --build build -j 4
  sudo cmake --build build --target install
}

install_nlohmann_json() {
  local nlohmann_json_version="3.10.2"
  if [ -d json ]
  then
    rm -rf json
  fi
  git clone https://github.com/nlohmann/json.git
  cd json
  git checkout v${nlohmann_json_version}
  cmake -S . -B build
  cmake --build build -j 4
  sudo cmake --build build --target install
  cd ../
}

install_json_schema_validator() {
  local json_schema_validator_version="2.1.0"
  if [ -d json-schema-validator ]
  then
    rm -rf json-schema-validator
  fi
  git clone https://github.com/pboettch/json-schema-validator
  cd json-schema-validator
  git checkout ${json_schema_validator_version}
  cmake -S . -B build
  cmake --build build -j 4
  sudo cmake --build build --target install
  cd ../
}
