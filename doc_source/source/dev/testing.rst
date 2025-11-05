=======
Testing
=======

If you're developing DataFed, there are several ways to test the application. This guide focuses on running

A. **unit tests** for the Foxx microservices used with ArangoDB.
B. **integration tests** using the python client code.

A. Unit Testing with Foxx Microservices
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

This will deploy the Foxx microservices and automatically execute the unit
tests against the ArangoDB instance.

B. Integration Testing with Python Client
=========================================

The python client integration tests can be run by running a mock core service
in either directly on the host, or by building it in an container and running
the container.

If using CMake and Ctest to run the tests it will build the mock core service
and run it outside of a container.  The guide below demonstrates the
alternative or running the mock core service in a container.

1. Build and Run python client against Mock Core Server
-------------------------------------------------------

If you want to test the python client against a mock of the core service a mock
is located in the tests/mock_core folder. This container can be run to provide
dummy responses to mimic the zmq communication flow. The mock core service is
provisioned with specific dummy values for an authenticated user.

To build the mock the following can be run.

NOTE: This assumes that the datafed dependencies and datafed runtime base
images have already been built and are cached locally.

The below must be executed from the root of the DataFed github repo.

.. code-block:: bash
   docker build \
     --build-arg DEPENDENCIES=datafed-dependencies:latest \
     --build-arg RUNTIME=datafed-runtime:latest \
     -f tests/mock_core/docker/Dockerfile . \
     -t datafed-mock-core:latest

To run the mock

.. code-block:: bash
   export MOCK_KEYS_FOLDER=$(pwd)/keys
   export MOCK_LOG_FOLDER=$(pwd)/logs
   mkdir -p ${MOCK_KEYS_FOLDER}
   mkdir -p ${MOCK_LOG_FOLDER}
   docker run \
     --user $(id -u) \
     -p 9998:9998 \
     -v ${MOCK_LOG_FOLDER}:/opt/datafed/logs \
     -v ${MOCK_KEYS_FOLDER}:/opt/datafed/keys \
     -t datafed-mock-core:latest

You should be able to run python integration tests directly against the core
service. NOTE, you will have to make sure that python integration tests have
access to the mock's public key.

The below assumes that the python interpreter is in an environment with all of
the required modules already installed.

.. code-block:: bash

   DATAFED_MOCK_CORE_PUB_KEY=${MOCK_KEYS_FOLDER}/datafed-mock-core-key.pub
   PYTHONPATH=./python/datafed_pkg ./python/datafed_pkg/tests/integration/test_MessageLib.py


