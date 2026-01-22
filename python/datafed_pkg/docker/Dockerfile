# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f python/datafed_pkg/docker/Dockerfile .

ARG                        BUILD_BASE="debian:bookworm-slim"
ARG                      DEPENDENCIES="dependencies"
ARG                       DATAFED_DIR="/datafed"
ARG              DATAFED_INSTALL_PATH="/opt/datafed"
ARG DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"
ARG                         BUILD_DIR="$DATAFED_DIR/source"
ARG         DATAFED_DEPENDENCIES_ROOT="$BUILD_DIR/external/DataFedDependencies"
ARG                  DATAFED_PYPI_REPO="datafed"

FROM ${DEPENDENCIES} AS python-client-build

SHELL ["/bin/bash", "-c"]

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_ROOT
ARG DATAFED_PYPI_REPO

ENV DATAFED_INSTALL_PATH="${DATAFED_INSTALL_PATH}"
ENV DATAFED_DEPENDENCIES_INSTALL_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
ENV DATAFED_PYPI_REPO="${DATAFED_PYPI_REPO}"

RUN mkdir -p ${DATAFED_DEPENDENCIES_ROOT}/scripts/ && \
  mv ./scripts/dependency_versions.sh          ${DATAFED_DEPENDENCIES_ROOT}/scripts/ && \
  mv ./scripts/generate_dependencies_config.sh ${DATAFED_DEPENDENCIES_ROOT}/scripts/

COPY ./common                          ${BUILD_DIR}/common
COPY ./python                          ${BUILD_DIR}/python
COPY ./CMakeLists.txt                  ${BUILD_DIR}
COPY ./scripts/generate_datafed.sh     ${BUILD_DIR}/scripts/
COPY ./cmake                           ${BUILD_DIR}/cmake
COPY ./external/DataFedDependencies    ${BUILD_DIR}/external/DataFedDependencies

# Configure and build the Python package (generates protobuf files and VERSION.py)
RUN ${DATAFED_DEPENDENCIES_ROOT}/scripts/generate_dependencies_config.sh && \
    ${BUILD_DIR}/scripts/generate_datafed.sh && \
    ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake -S. -B build \
      -DBUILD_REPO_SERVER=False \
      -DBUILD_AUTHZ=False \
      -DBUILD_CORE_SERVER=False \
      -DBUILD_WEB_SERVER=False \
      -DBUILD_DOCS=False \
      -DBUILD_PYTHON_CLIENT=True \
      -DBUILD_FOXX=False \
      -DENABLE_INTEGRATION_TESTS=False

RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build --target pydatafed

# Install Python build tools and package dependencies
RUN apt-get update && apt-get install -y python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel twine --break-system-packages

# Install package dependencies from requirements.txt
WORKDIR ${BUILD_DIR}/python/datafed_pkg
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Navigate to the package build directory and copy requirements.txt
WORKDIR ${BUILD_DIR}/build/python/datafed_pkg
RUN cp ${BUILD_DIR}/python/datafed_pkg/requirements.txt .

# Clean any previous builds and build distributions
RUN rm -rf dist/ build/ *.egg-info/ && \
    python3 setup.py sdist bdist_wheel

# Create output directory for artifacts
RUN mkdir -p /output && cp -r dist/* /output/

# Final stage for deployment - minimal image with just the built packages
FROM ${BUILD_BASE} AS python-client-deploy

ARG DATAFED_DIR
ARG BUILD_DIR

# Install Python and twine for PyPI upload
RUN apt-get update && \
    apt-get install -y python3-pip && \
    rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --upgrade pip twine --break-system-packages

# Copy built distributions from build stage
COPY --from=python-client-build /output /dist

WORKDIR /dist

# The deploy command will be run via CI
CMD ["/bin/bash"]
