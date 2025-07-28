#!/bin/bash

# Versions
DATAFED_CMAKE_VERSION="3.31.6"
DATAFED_GLOBUS_VERSION="6.0.31-1"
DATAFED_JSON_SCHEMA_VALIDATOR_VERSION="2.3.0"
DATAFED_NLOHMANN_JSON_VERSION="3.12.0"
DATAFED_LIBSODIUM_VERSION="1.0.18"
# this version is different from above due to the fact libsodium names its shared library diffrently than the actual api version
DATAFED_LIB_LIBSODIUM_VERSION="23.3.0"
DATAFED_LIBZMQ_VERSION="4.3.4"
# this version is different from above due to the fact libzmq names its shared library diffrently than the actual api version
DATAFED_LIB_LIBZMQ_VERSION="5.2.4"
DATAFED_LIB_ZMQCPP_VERSION="4.10.0"
# we cannot use node 22 even though it is the currently highest supported LTS version, due to a currently unsolved build error
DATAFED_NODE_VERSION="v20.18.2"
DATAFED_NVM_VERSION="v0.40.1"
DATAFED_PYTHON_VERSION="3.9"
DATAFED_PYTHON_VERSION_FULL="3.9.22"
# Git tag
DATAFED_PROTOBUF_VERSION="25.7"
# Dynamic library extension .so.{DATAFED_FULL_PROTOBUF_VERSION}
DATAFED_DYNAMIC_LIBRARY_PROTOBUF_VERSION="25.7.0"
# Full version
DATAFED_FULL_PROTOBUF_VERSION="4.25.7"
DATAFED_LIBCURL="8.11.0"
DATAFED_LIBCURL_URL="https://github.com/curl/curl/releases/download/curl-8_11_0/curl-8.11.0.tar.gz"
DATAFED_OPENSSL="1.1.1"
DATAFED_OPENSSL_COMMIT="e04bd34"
DATAFED_BOOST="1.74.0"
DATAFED_ZLIB_VERSION="1.3.1"
DATAFED_ZLIB_URL="https://zlib.net/zlib-1.3.1.tar.gz"
DATAFED_GCS_SUBMODULE_VERSION="ff7167860345e9b994110dfabdb251fe4dea8c00"
