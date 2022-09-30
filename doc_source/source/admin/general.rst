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
node/VM up up to a dedicated high-performance cluster. The host operating system must be Linux, but
the specific distribution is not important.

Central Services:
- DataFed Core Service
- DataFed Web Service
- Arango Database

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

This can be done with a helper script::

    ./DataFed/scripts/install_dependencies.sh

The next step is to enter configuration options that are listed in ./config/datafed.sh. These
options can be used create the required services and configuration files. Below are a list
of the configuration options:

1. DATAFED_DEFAULT_LOG_PATH - Needed by core, repo, web services
2. DATABASE_PASSWORD - Needed by core
3. DATAFED_ZEROMQ_SESSION_SECRET - Needed by web server
4. DATAFED_ZEROMQ_SYSTEM_SECRET - Needed by web server
5. DATAFED_LEGO_EMAIL - Needed by web server
6. DATAFED_GLOBUS_APP_ID - Needed by core server
7. DATAFED_GLOBUS_APP_SECRET - Needed by core server
8. DATAFED_SERVER_DOMAIN_NAME_AND_PORT - Needed by repo server
9. DATAFED_DOMAIN - Needed by repo, web and authz
10. DATAFED_GCS_ROOT_NAME - Needed by repo and authz by Globus
11. GCS_COLLECTION_ROOT_PATH - Needed by repo and authz for Globus 
12. DATAFED_REPO_ID_AND_DIR - Needed for repo and authz

Descriptions of what these variables are can also be found in the ./config/datafed.sh file. Once the 
necessary variables have been provided a series of scripts have been developed to appropriately
automatically configure much of the setup.

DataFed Core Service, ArangoDB and Web Configuration
====================================================

Once items in the ./config/datafed.sh file have been specified

Get and build the DataFed source code::

    cd DataFed
    ./scripts/generage_core_config.sh
    ./scripts/generage_ws_config.sh
    ./scripts/generage_core_service.sh
    ./scripts/generage_ws_service.sh
    mkdir build
    cmake -S . -B build
    cmake --build build --parallel 6
    sudo cmake --build --target install

Calling the installation command will install the core and web services in the,
/etc/systemd/system folder. It will also place the binaries in the /opt/datafed
folder under a core and web subfolder.





To also build the repository service and install the authz library you will need to
provide additional cmake flags.




Service Installation & Configuration
====================================

----------------
Central Services
----------------

DataFed central services include the Core service, the database, and the web service. These
services may be installed together on a single node, or across multiple nodes. If the latter
is chosen, it is strongly recommended that a high-speed private network be used in order to
reduce latency and avoid the need for TLS connections.

Core Service
------------

Steps to deploy DataFed Core Service:

1. Build DataFed source code as described in previous section.
2. Copy/link core executable (DataFed/build/core/service/sdms-core) to installation location (i.e. /opt/datafed)
3. Copy/link core systemd service (DataFed/core/server/sdms-core.service) to /etc/systemd/system
4. Create a core service configuration file (i.e. /opt/datafed/datafed-core.cfg). See example below.

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

Database
--------

Steps to deploy DataFed Database:

1. Download and install the latest ArangoDB server package for your host operating system. (see example, below)

Example download/install of ArangoDB 3.7 for Ubuntu::

    wget https://download.arangodb.com/arangodb37/Community/Linux/arangodb3_3.7.10-1_amd64.deb
    sudo apt install ./arangodb3_3.7.10-1_amd64.deb

Web Service
-----------

For the DataFed web service, install the following packages::

    sudo apt install nodejs
    sudo apt install npm
    npm install express
    npm install express-session
    npm install cookie parser
    npm install helmet
    npm install protobufjs
    npm install zeromq@5.2.0
    npm install ect
    npm install client-oauth2

---------------
Data Repository
---------------

For a DataFed data repository, install Globus Connect v4::

    sudo curl -LOs https://downloads.globus.org/toolkit/globus-connect-server/globus-connect-server-repo_latest_all.deb
    sudo dpkg -i globus-connect-server-repo_latest_all.deb
    sudo apt-get update
    sudo apt-get install globus-connect-server

