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

The hardware configuration selection depends on desired performace/cost and can range from a single
node/VM up up to a dedicated high-performacne cluster. The host operating system must be Linux, but
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

Building DataFed
================

To deply DataFed, it must be built from source code hosted on `GitHub <https://github.com/ORNL/DataFed>`_.
Prior to building DataFed, the build environment must be properly configured as described below
(the examples are based on Debian). Min/max version restrictions are listed later in the Dependencies section.

Install packages required to build DataFed::

    sudo apt install g++
    sudo apt install git
    sudo apt install cmake
    sudo apt install libboost-all-dev
    sudo apt install protobuf-compiler
    sudo apt install libzmq3-dev
    sudo apt install libssl-dev
    sudo apt install libcurl4-openssl-dev
    sudo apt install libglobus-common-dev
    sudo apt install libfuse-dev

Get and build the DataFed source code::

    git clone https://github.com/ORNL/DataFed.git
    cd DataFed
    mkdir build
    cd build
    cmake ..
    make

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

