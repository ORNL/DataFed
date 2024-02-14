ARG          DATAFED_DIR="/datafed"
ARG DATAFED_INSTALL_PATH="/opt/datafed"
ARG            GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG            BUILD_DIR="$DATAFED_DIR/source"
ARG              NVM_DIR="$DATAFED_DIR/.nvm"
ARG              NVM_INC="$DATAFED_DIR/.nvm/versions/node/v13.14.0/include/node"
ARG              NVM_BIN="$DATAFED_DIR/.nvm/versions/node/v13.14.0/bin"
ARG              LIB_DIR="/usr/local/lib"

FROM ubuntu:focal

ARG NVM_DIR
ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DEBIAN_FRONTEND=noninteractive
ARG LIB_DIR

ENV BUILD_DIR="${BUILD_DIR}"
ENV DATAFED_DIR="${DATAFED_DIR}"
ENV LIB_DIR="${LIB_DIR}"

RUN mkdir -p ${BUILD_DIR}
RUN mkdir -p ${BUILD_DIR}/logs
RUN mkdir -p ${BUILD_DIR}/repository/server
RUN mkdir -p ${BUILD_DIR}/common/proto
RUN mkdir -p /libraries

WORKDIR ${BUILD_DIR}

# Copy install scripts
COPY ./scripts/dependency_install_functions.sh	${BUILD_DIR}/scripts/
COPY ./scripts/dependency_versions.sh						${BUILD_DIR}/scripts/
COPY ./scripts/install_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_core_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_repo_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_ws_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_authz_dependencies.sh ${BUILD_DIR}/scripts/

RUN echo "#!/bin/bash\n\$@" > /usr/bin/sudo && chmod +x /usr/bin/sudo

# run build scripts
RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_dependencies.sh

COPY ./scripts/copy_dependency.sh ${BUILD_DIR}/scripts/
RUN ${BUILD_DIR}/scripts/copy_dependency.sh protobuf from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh protoc from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libzmq from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libsodium from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh boost_program_options from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh boost_filesystem from

RUN mkdir -p ${DATAFED_INSTALL_PATH}
RUN mkdir -p ${DATAFED_INSTALL_PATH}/keys

WORKDIR ${BUILD_DIR}

COPY ./common ${BUILD_DIR}/common

# RUN cp -R $HOME/.nvm ${NVM_DIR}