#!/bin/bash

# Exit on error
set -e

# This script will install all of the dependencies needed by DataFed 1.0
sudo apt-get update
sudo dpkg --configure -a
sudo apt-get install -y libtool build-essential g++ gcc cmake libboost-all-dev pkg-config autoconf automake libtool make unzip git python3-pkg-resources
sudo apt-get install -y libzmq3-dev  python3-pip

python3 -m pip install --upgrade pip
python3 -m pip install setuptools

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

