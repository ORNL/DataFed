=======
Testing
=======

If you're developing DataFed, there are several ways to test the application. This guide focuses on running **unit tests** for the Foxx microservices used with ArangoDB.

Unit Testing with Foxx Microservices
====================================

ArangoDB supports running small applications called *Foxx microservices*. You can run unit tests for these services without standing up the full DataFed application by using a standalone ArangoDB instance.

1. Start an ArangoDB Container
---------------------------

First, pull the official ArangoDB Docker image:

NOTE: the use of 3.12.4 is what has been tested, other minor versions changes of ArangoDB should also work.

.. code-block:: bash

   docker pull arangodb/arangodb:3.12.4

Next, run the container, specifying a root password for the database:

.. code-block:: bash

   docker run -d \
     -e ARANGO_ROOT_PASSWORD="<password>" \
     -p 8529:8529 \
     arangodb/arangodb:3.12.4

You now have a running ArangoDB instance to install Foxx services and run tests against.

2. Build Docker Images
-------------------

To run Foxx tests, you'll need two images:
- A **dependencies image**
- A **Foxx services image**

Assuming you're at the root of the DataFed repository:

**Build the dependencies image:**

.. code-block:: bash

   docker build -f ./docker/Dockerfile.dependencies . -t datafed-dependencies:latest

**Build the Foxx services image:**

.. code-block:: bash

   docker build \
     --build-arg DEPENDENCIES=datafed-dependencies:latest \
     -f ./docker/Dockerfile.foxx . \
     -t datafed-foxx:latest

3. Run Unit Tests
--------------

Now, run the Foxx container with the appropriate environment variables to install the services and enable testing:

DATAFED_DATABASE_PASSWORD, can be anything but it should be consistent with what is in the config/datafed.sh file.

.. code-block:: bash

   docker run \
     -e DATAFED_DATABASE_PASSWORD="<password>" \
     -e INSTALL_FOXX=ON \
     -e ENABLE_FOXX_TESTS=TRUE \
     --user $(id -u):0 \
     --network=host \
     --security-opt no-new-privileges \
     datafed-foxx:latest

This will deploy the Foxx microservices and automatically execute the unit tests against the ArangoDB instance.

