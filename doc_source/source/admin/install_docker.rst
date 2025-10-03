==============
Administration
==============

Docker Deployment (Preferred Installation Method)
=================

Deploying DataFed requires building, installing, and configuring DataFed service as well as several
third-party packages/services. The process described here is automated  as much as possible 
(via container technology). The services to be deployed relate to either the DataFed "Central Services"
(of which there is only one instance) and DataFed "Data Repositories". (These services are listed below.)

The hardware configuration selection depends on desired performance/cost and can range from a single
node/VM up to a dedicated high-performance cluster.

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
- Globus Connect Service (version 5)

Client Applications:
- DataFed Python Client

Globus Setup
============

#. Log in to `Globus <https://app.globus.org>`_.
#. Navigate to Settings > Developers > Add Project.
#. Select an accurate name and contact email for your project.
#. Navigate to Add an App > Advanced Registration.
#. Choose an accurate name for your app, and in the redirects field add the single redirect ``https://localhost/ui/authn`` for development, or your domain/IP for production
#. Click Add Client Secret and choose a descriptive name.
#. Take note of the Secret that it generates and the Client UUID of the Globus application and remember them for future steps.

Downloading DataFed & Configuration
===================================

To deploy DataFed, its containers must be built from source code hosted on `GitHub <https://github.com/ORNL/DataFed>`_.
Prior to building DataFed, Docker must be installed.
The following examples are based on Debian.

Downloading DataFed:

.. code-block:: bash

    git clone https://github.com/ORNL/DataFed.git

If you are deploying in development mode, the next step is to enter configuration options that are listed in ./.env To
generate a template for this file you will first need to run:

.. code-block:: bash

    ./compose/all/generate_env.sh

These options can be used create the required services and configuration files. Below are a list
of the relevant configuration options to an initial deployment:

1. DATAFED_GLOBUS_APP_SECRET
2. DATAFED_GLOBUS_APP_ID
3. DATAFED_ZEROMQ_SESSION_SECRET
5. DATAFED_DATABASE_PASSWORD
6. DATAFED_DATABASE_IP_ADDRESS
7. DATAFED_GCS_ROOT_NAME
8. DATAFED_GCS_IP
9. DATAFED_REPO_ID_AND_DIR
10. DATAFED_HOST_COLLECTION_MOUNT
11. DATAFED_GLOBUS_SUBSCRIPTION
12. DATAFED_GCS_COLLECTION_BASE_PATH
13. DATAFED_GCS_COLLECTION_ROOT_PATH


Descriptions of what these variables are can also be found in the ./scripts/compose_generate_env.sh file. Once the 
necessary variables have been provided a series of scripts have been developed to appropriately
automatically configure much of the setup.

Building Containers
===================

To build the containers you must simply run:

.. code-block:: bash

    ./compose/all/build_containers_for_compose.sh

The first time you build should take approximately 15-25 minutes based on system specifications, however subsequent builds will be significantly faster.
This is due to dependency caching, since the first build is what builds and caches the dependencies.

Running the Containers (Development)
====================================

Note: Before running the containers, ensure that the necessary directories are created on the host machine with the
correct permissions. You can create the directories by running the following script:

.. code-block:: bash

        ./scripts/globus/setup_collection_directory.sh all

For convenience, development installations are fully supported utilizing docker compose.
Once fully built and configured, the development instance can be started with the following commands:

.. code-block:: bash

    ./compose/all/unset_env.sh
    docker compose -f ./compose/all/compose.yml up

This will startup all the necessary services and maintain state across restarts through docker volumes.

Running the Containers (Production)
===================================

Running the containers in production is a similar process to running them in development mode,
except the Docker containers are run manually rather than being run by Docker compose.

To begin, you will want to create a Docker network to attach the containers to so that they may communicate:

.. code-block:: bash

    docker network create datafed-network

Following are examples of docker run commands for each service

Core Service
------------

Here is an example for the core service:

.. code-block:: bash

    docker run -d \
        --restart=always \
        --name datafed-core \
        --user $(id -u):0 \
        -e DATAFED_GLOBUS_APP_SECRET="" \
        -e DATAFED_GLOBUS_APP_ID="" \
        -e DATAFED_ZEROMQ_SESSION_SECRET="" \
        -e DATAFED_DOMAIN="" \
        -e DATAFED_DATABASE_PASSWORD="" \
        -e DATAFED_DATABASE_IP_ADDRESS_PORT="" \
        -e DATAFED_DEFAULT_LOG_PATH="" \
        -e DATAFED_CORE_ADDRESS_PORT_INTERNAL="" \
        --security-opt no-new-privileges \
        --network datafed-network \
        -p 7513:7513 \
        -p 7512:7512 \
        -v "/local/path/logs:/datafed/logs" \
        -v "/local/path/keys/datafed-core-key.pub:/opt/datafed/keys/datafed-core-key.pub" \
        -v "/local/path/keys/datafed-core-key.priv:/opt/datafed/keys/datafed-core-key.priv" \
        -t "datafed-core:latest" 

Web Service
------------

Here is an example for the web service:

.. code-block:: bash

    docker run -d \
        --restart=always \
        --name datafed-web \
        -e DATAFED_GLOBUS_APP_SECRET="" \
        -e DATAFED_GLOBUS_APP_ID="" \
        -e DATAFED_ZEROMQ_SESSION_SECRET="" \
        -e DATAFED_DOMAIN="" \
	    -e DATAFED_WEB_CERT_PATH="" \
	    -e DATAFED_WEB_KEY_PATH="" \
        -e DATAFED_DEFAULT_LOG_PATH="" \
        -e DATAFED_CORE_ADDRESS_PORT_INTERNAL="" \
	    -e DATAFED_GOOGLE_ANALYTICS_TAG="" \
        -e UID="" \
        --network datafed-network \
        -p 7513:7513 \
        -p 7512:7512 \
        -v "/local/path/logs:/datafed/logs" \
        -v "/local/path/keys/datafed-core-key.pub:/opt/datafed/keys/datafed-core-key.pub" \
	    -v "$DATAFED_WEB_CERT_PATH:$DATAFED_WEB_CERT_PATH" \
	    -v "$DATAFED_WEB_KEY_PATH:$DATAFED_WEB_KEY_PATH" \
        -t "datafed-web:latest" 

Repository Service
------------

Here is an example for the repository service:

.. code-block:: bash

    docker run -d \
        --restart=always \
        --name datafed-repo \
        -e DATAFED_GLOBUS_APP_SECRET="" \
        -e DATAFED_GLOBUS_APP_ID="" \
        -e DATAFED_ZEROMQ_SESSION_SECRET="" \
	    -e DATAFED_HTTPS_SERVER_PORT="" \
        -e DATAFED_DOMAIN="" \
        -e DATAFED_DEFAULT_LOG_PATH="" \
        -e DATAFED_CORE_ADDRESS_PORT_INTERNAL="" \
        -e DATAFED_GCS_BASE_PATH="" \
        -e DATAFED_GCS_COLLECTION_ROOT_PATH="" \
        -e UID="" \
        --network datafed-network \
        -p 7513:7513 \
        -p 7512:7512 \
        -v "/local/path/logs:/datafed/logs" \
        -v "/local/path/keys/datafed-repo-key.pub:/opt/datafed/keys/datafed-repo-key.pub" \
        -v "/local/path/keys/datafed-repo-key.priv:/opt/datafed/keys/datafed-repo-key.priv" \
        -v "/local/collection/path:$DATAFED_GCS_COLLECTION_ROOT_PATH/$DATAFED_REPO_ID_AND_DIR"
        -t "datafed-repo:latest" 

Globus Service
------------

Here is an example for the Globus Connect Server service:

.. code-block:: bash

    docker run -d \
        --restart=always \
        --name datafed-gcs \
        -e DATAFED_GLOBUS_APP_SECRET="" \
        -e DATAFED_GLOBUS_APP_ID="" \
        -e DATAFED_ZEROMQ_SESSION_SECRET="" \
        -e DATAFED_HTTPS_SERVER_PORT="" \
        -e DATAFED_DOMAIN="" \
        -e DATAFED_CORE_ADDRESS_PORT_INTERNAL="" \
        -e DATAFED_DEFAULT_LOG_PATH="" \
        -e DATAFED_GCS_BASE_PATH="" \
        -e DATAFED_GCS_COLLECTION_ROOT_PATH="" \
        -e DATAFED_GCS_ROOT_NAME="" \
        -e DATAFED_GLOBUS_SUBSCRIPTION="" \
        -e DATAFED_GLOBUS_CONTROL_PORT="" \
        -e DATAFED_REPO_USER="" \
        -e DATAFED_AUTHZ_USER="" \
        -e BUILD_WITH_METADATA_SERVICES="FALSE" \
        -e DATAFED_REPO_ID_AND_DIR="" \
        -e DATAFED_GCS_IP="" \
        -e DATAFED_REPO_DOMAIN="" \
        -e UID="" \
        --network=host \
        -v "/local/path/logs:/datafed/logs" \
        -v "/local/base/path/globus:/opt/datafed/globus" \
        -v "/local/base/path/keys/datafed-repo-key.pub:/opt/datafed/keys/datafed-repo-key.pub" \
        -v "/local/base/path/keys/datafed-repo-key.priv:/opt/datafed/keys/datafed-repo-key.priv" \
        -v "/local/collection/path:$DATAFED_GCS_COLLECTION_ROOT_PATH/$DATAFED_REPO_ID_AND_DIR"
        -t "datafed-gcs:latest"

Notice that the gcs container must run in host networking mode to avoid performance bottlenecks with GridFTP.

Nginx Service
-------------

This service is not necessary for Datafed to function, however it is included here as a convenience,
as it will allow you to setup temporary redirects for maintenance, rate limiting, better security using a standardized tool.

Here is an example:

.. code-block:: bash

    docker run -d \
        --restart=always \
        --name datafed-nginx \
        --network datafed-network \
        -p 443:443 \
        -p 80:80 \
        -v "/local/path/nginx/nginx.conf:/etc/nginx/conf.d/default.conf" \
        -v "/local/path/nginx/sites-enabled:/etc/nginx/sites-enabled" \
        -v "/local/path/nginx/www:/www" \
        -v "/local/path/keys/datafed.ornl.gov.crt:/etc/nginx/certs/datafed.ornl.gov.crt" \
        -v "/local/path/keys/datafed.ornl.gov.key:/etc/nginx/certs/datafed.ornl.gov.key" \
        nginx:latest

Networking
==========

If the web server and core server are on different machines you will need to
ensure that they can communicate, this will require exchanging the public keys
that are in the /opt/datafed/keys folder.
