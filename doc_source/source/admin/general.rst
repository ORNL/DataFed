==============
Administration
==============

System Deployment
=================

Deploying DataFed requires building, installing, and configuring DataFed service as well as several
third-party packages/services. The process described here is manual, but the goal is to eventually
automate this process as much as possible (via container technology). The services to be deployed
relate to either the DataFed "Central Services" (of which there is only one instance) and DataFed
"Data Repositories". (These services are listed below.)

The hardware configuration selection depends on desired performance/cost and can range from a single
node/VM up to a dedicated high-performance cluster. The host operating system must be Linux, but
the specific distribution is not important. Though through testing at the moment
has been limited to ubuntu:focal.

Central Services:
- DataFed Core Service
- DataFed Web Service
- Arango Database

DataFed central services include the Core service, the database, and the web service. These
services may be installed together on a single node, or across multiple nodes. If the latter
is chosen, it is strongly recommended that a high-speed private network be used in order to
reduce latency and avoid the need for TLS connections.

Data Repository:
- DataFed Repository Service
- Globus Connect Service (version 4)
- DataFed GridFTP AUTHZ Module

Client Applications:
- DataFed Python Client

Downloading DataFed & Installing Dependencies
=============================================

To deply DataFed, it must be built from source code hosted on `GitHub <https://github.com/ORNL/DataFed>`_.
Prior to building DataFed, the build environment must be properly configured as described below
(the examples are based on Debian). Min/max version restrictions are listed later in the Dependencies section.

Downloading DataFed::

    git clone https://github.com/ORNL/DataFed.git

Install packages required to build DataFed:

* g++
* git
* cmake
* libboost-all-dev
* protobuf-compiler
* libzmq3-dev
* libssl-dev
* libcurl4-openssl-dev
* libglobus-common-dev
* libfuse-dev
* nodejs
* npm

The npm packages needed primarily by the web server are:

* express
* express-session
* cookie-parser
* helmet
* ini
* protobufjs
* zeromq
* ect
* client-oauth2

This can be done with a helper scripts these scripts are for ubuntu::

    ./DataFed/scripts/install_core_dependencies.sh
    ./DataFed/scripts/install_repo_dependencies.sh
    ./DataFed/scripts/install_ws_dependencies.sh

The next step is to enter configuration options that are listed in ./config/datafed.sh. To
generate a template for this file you will first need to run::

    ./DataFed/scripts/generate_datafed.sh

These options can be used create the required services and configuration files. Below are a list
of the configuration options:

1. DATAFED_DEFAULT_LOG_PATH - Needed by core, repo, web services
2. DATAFED_DATABASE_PASSWORD - Needed by core
3. DATAFED_ZEROMQ_SESSION_SECRET - Needed by web server
4. DATAFED_ZEROMQ_SYSTEM_SECRET - Needed by web server
5. DATAFED_LEGO_EMAIL - Needed by web server
6. DATAFED_WEB_KEY_PATH - Needed by web server
7. DATAFED_WEB_CERT_PATH - Needed by web server
8. DATAFED_GLOBUS_APP_ID - Needed by core server
9. DATAFED_GLOBUS_APP_SECRET - Needed by core server
10. DATAFED_SERVER_PORT - Needed by repo server
11. DATAFED_DOMAIN - Needed by repo, web and authz
12. DATAFED_GCS_ROOT_NAME - Needed by repo and authz by Globus
13. DATAFED_GCS_COLLECTION_ROOT_PATH - Needed by repo and authz for Globus 
14. DATAFED_REPO_ID_AND_DIR - Needed for repo and authz

Descriptions of what these variables are can also be found in the ./config/datafed.sh file. Once the 
necessary variables have been provided a series of scripts have been developed to appropriately
automatically configure much of the setup.

General Installation & Configuration
====================================

DataFed configuration files will by default be placed in:

/opt/datafed/keys
/opt/datafed/authz
/opt/datafed/repo
/opt/datafed/core
/opt/datafed/web

Log files will by default be placed in:

/var/log/datafed

Services will by default be installed in:

/etc/systemd/system folder

The authz configuration for GridFTP will be installed in the following path:

/etc/grid-security

Database
--------

Steps to deploy DataFed Database:

1. Download and install the latest ArangoDB server package for your host operating system. (see example, below)

Example download/install of ArangoDB 3.7 for Ubuntu::

    wget https://download.arangodb.com/arangodb37/Community/Linux/arangodb3_3.7.10-1_amd64.deb
    sudo apt install ./arangodb3_3.7.10-1_amd64.deb

It should start automatically with an install but to run the arangodb service, you
can also interact with it via systemctl::

    sudo systemctl start arangodb3.service

We will then need to install the foxx services on the same machine as the 
arngodb database. Building and installing foxx service::

    cd DataFed
    mkdir build
    cmake -S . -B build -DBUILD_REPO_SERVER=False -DBUILD_AUTHZ=False \
                    -DBUILD_CORE_SERVER=False -DBUILD_WEB_SERVER=False \
                    -DBUILD_DOCS=False -DBUILD_PYTHON_CLIENT=False \
                    -DBUILD_FOXX=True
    cmake --build build --parallel 6
    sudo cmake --build --target install

Core Service
------------

For a DataFed core server, start by generate the core server config file - a
datafed.sh file must exist in DataFed/config/ before calling this script::

    ./DataFed/scripts/generage_core_config.sh

Build the core service file::

    ./DataFed/scripts/generage_core_service.sh

Building the compiling the core service::

    cd DataFed
    mkdir build
    cmake -S . -B build -DBUILD_REPO_SERVER=False -DBUILD_AUTHZ=False \
                    -DBUILD_CORE_SERVER=True -DBUILD_WEB_SERVER=False \
                    -DBUILD_DOCS=False -DBUILD_PYTHON_CLIENT=False \
                    -DBUILD_FOXX=False
    cmake --build build --parallel 6
    sudo cmake --build build --target install

Example datafed-core.cfg file::

    port = 9100
    client-threads = 4
    task-threads = 4
    db-url = http://127.0.0.1:8529/_db/sdms/api/
    db-user = root
    db-pass = <password>
    cred-dir = /opt/datafed/keys
    client-id = <Globus App ID>
    client-secret = <Globus App Secret>

To run the service::

    sudo systemctl start datafed-core.service

Web Service
-----------

For a DataFed web server, start by generate the web server config file - a
datafed.sh file must exist in DataFed/config/ before calling this script::

    ./DataFed/scripts/generage_ws_config.sh

In addition, the web server will need to be placed on a machine with a domain
name and for public access a public ip address. If this is the case there is
a helper script to generate the certificates for you using let's encrypt::

    ./install_lego_and_certificates.sh

If using your own certificates, by default datafed will look for them in the 
path, you can see where exactly it is looking by opening the config file
in /opt/datafed/web/, note they will only appear there after calling the cmake
install command::

    /opt/datafed/keys

Build the web service file::

    ./DataFed/scripts/generage_ws_service.sh

Building the web service::

    cd DataFed
    mkdir build
    cmake -S . -B build -DBUILD_REPO_SERVER=False -DBUILD_AUTHZ=False \
                    -DBUILD_CORE_SERVER=False -DBUILD_WEB_SERVER=True \
                    -DBUILD_DOCS=False -DBUILD_PYTHON_CLIENT=False \
                    -DBUILD_FOXX=False
    cmake --build build --parallel 6
    sudo cmake --build build --target install

It should start automatically with an install but to run the web service, you
can also interact with it via systemctl::

    sudo systemctl start datafed-ws.service

Data Repository
---------------

For a DataFed data repository, install Globus Connect v4 or v5::

    sudo curl -LOs https://downloads.globus.org/toolkit/globus-connect-server/globus-connect-server-repo_latest_all.deb
    sudo dpkg -i globus-connect-server-repo_latest_all.deb
    sudo apt-get update
    sudo apt-get install globus-connect-server

If using Globus Connect Server v5 there is a helper script to help set up your
local collections correctly::

    ./DataFed/scripts/globus/setup_globus.sh

There will be instructions you will need to follow after running the scirpt,
which require manual interaction with the Globus web server. Once a guest 
collection has been created, you will then be able to register the DataFed repo
server with the DataFed administrator. The information needed to connect the
repo server to the core server can be accessed by running::

    ./DataFed/scripts/globus/generate_repo_form.sh

Generate the repo config file - a datafed.sh file must exist in DataFed/config/
before calling this script::

    ./DataFed/scripts/generage_repo_config.sh

Build the repo service file::

    ./DataFed/scripts/generage_repo_service.sh

Building the repo service::

    cd DataFed
    mkdir build
    cmake -S . -B build -DBUILD_REPO_SERVER=True -DBUILD_AUTHZ=False \
                    -DBUILD_CORE_SERVER=False -DBUILD_WEB_SERVER=False \
                    -DBUILD_DOCS=False -DBUILD_PYTHON_CLIENT=False \
                    -DBUILD_FOXX=False
    cmake --build build --parallel 6
    sudo cmake --build build --target install

It should start automatically with an install but to run the repo service, you
can also interact with it via systemctl::

    sudo systemctl start datafed-repo.service

Authz Library
-------------

Generate the authz config file - a datafed.sh file must exist in DataFed/config/
before calling this script::

    ./DataFed/scripts/generage_authz_config.sh

Building the authz library for Globus version 5, note you should install authz
library on the same machine as a Globus Connect Server::

    cd DataFed
    mkdir build
    cmake -S . -B build -DBUILD_REPO_SERVER=False -DBUILD_AUTHZ=True \
                    -DBUILD_CORE_SERVER=False -DBUILD_WEB_SERVER=False \
                    -DBUILD_DOCS=False -DBUILD_PYTHON_CLIENT=False \
                    -DBUILD_FOXX=False -DGLOBUS_VERSION=5
    cmake --build build --parallel 6
    sudo cmake --build --target install

At this point you will want to restart the globus-gridft-server::

    sudo systemctl restart globus-gridft-server.service

Networking
==========

If the web server and core server are on different machines you will need to
ensure that they can communicate, this will require exchanging the public keys
that are in the /opt/datafed/keys folder.
