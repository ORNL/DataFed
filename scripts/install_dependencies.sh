#!/bin/bash

# Exit on error
set -e

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

# This script will install all of the dependencies needed by DataFed 1.0
sudo apt-get update
sudo dpkg --configure -a
sudo apt-get install -y libtool build-essential g++ gcc npm cmake libboost-all-dev pkg-config autoconf automake libtool curl make unzip libcurl4-openssl-dev libfuse-dev rapidjson-dev libglobus-common-dev libkrb5-dev
sudo apt-get install -y libzmq3-dev 

# The foxx services need node version 12 or greater so we aren't going to use the package manager
# but instead will install ourselves

# 1. Install nvm which will allow us to update node
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash

NODE_VERSION="v14.21.3"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm

nvm install $NODE_VERSION
nvm use $NODE_VERSION

if [ -d json ]
then
	rm -rf json
fi

cd ~
git clone https://github.com/nlohmann/json.git
cd json
git checkout v3.10.2
cmake -S . -B build
cmake --build build -j 4
sudo cmake --build build --target install
cd ~

if [ -d json-schema-validator ]
then
	rm -rf json-schema-validator
fi
git clone https://github.com/pboettch/json-schema-validator
cd json-schema-validator
git checkout 2.1.0
cmake -S . -B build
cmake --build build -j 4
sudo cmake --build build --target install
cd ~

if [ -d protobuf ]
then
	# sudo required because of egg file
	sudo rm -rf protobuf 
fi
git clone  https://github.com/google/protobuf.git
cd protobuf
git checkout v3.17.3
git submodule update --init --recursive
cmake -S cmake/ -B build -DCMAKE_POSITION_INDEPENDENT_CODE=ON
cmake --build build -j 4
sudo cmake --build build --target install
cd python
python3 setup.py build
python3 setup.py test
sudo python3 setup.py install
cd ~

if [ -d libsodium ]
then
	rm -rf libsodium 
fi
git clone https://github.com/jedisct1/libsodium.git
cd libsodium
git checkout 1.0.18
./autogen.sh
./configure
make check
sudo make install
sudo ldconfig
cd ~

if [ -d libzmq ]
then
	rm -rf libzmq 
fi
git clone https://github.com/zeromq/libzmq.git
cd libzmq
git checkout v4.3.4
cmake -S. -B build
cmake --build build -j 4
sudo cmake --build build --target install
cd ~

npm --prefix ${PROJECT_ROOT}/web install ${PROJECT_ROOT}/web

curl -OL https://download.arangodb.com/arangodb38/DEBIAN/Release.key
sudo apt-key add - < Release.key
echo 'deb https://download.arangodb.com/arangodb38/DEBIAN/ /' | sudo tee /etc/apt/sources.list.d/arangodb.list
sudo apt-get install apt-transport-https
sudo apt-get update
sudo apt-get install arangodb3

