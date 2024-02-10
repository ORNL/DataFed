# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f web/docker/Dockerfile .
ARG           BUILD_BASE="ubuntu:focal"
ARG         DEPENDENCIES="dependencies"
ARG              RUNTIME="runtime"
ARG          DATAFED_DIR="/datafed"
ARG DATAFED_INSTALL_PATH="/opt/datafed"
ARG            GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG            BUILD_DIR="$DATAFED_DIR/source"
ARG              NVM_DIR="$DATAFED_DIR/.nvm"
ARG              NVM_INC="$DATAFED_DIR/.nvm/versions/node/v13.14.0/include/node"
ARG              NVM_BIN="$DATAFED_DIR/.nvm/versions/node/v13.14.0/bin"
ARG              LIB_DIR="/usr/local/lib"

FROM ${DEPENDENCIES} AS ws-build

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG NVM_DIR
ARG NVM_INC
ARG NVM_BIN

# This port is needed to communicate with the DataFed core server
EXPOSE 7513
# For communication with the public
EXPOSE 443

COPY ./CMakeLists.txt                 ${BUILD_DIR}
COPY ./scripts/dependency_versions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh    ${BUILD_DIR}/scripts/
COPY ./scripts/generate_ws_config.sh  ${BUILD_DIR}/scripts/
COPY ./scripts/install_ws.sh          ${BUILD_DIR}/scripts/
COPY ./cmake                          ${BUILD_DIR}/cmake
COPY ./common/proto                   ${BUILD_DIR}/common/proto
COPY ./web                            ${BUILD_DIR}/web

RUN ${BUILD_DIR}/scripts/generate_datafed.sh && \
	cmake -S. -B build						\
		-DBUILD_REPO_SERVER=False		\
		-DBUILD_AUTHZ=False					\
		-DBUILD_CORE_SERVER=False		\
		-DBUILD_WEB_SERVER=True			\
		-DBUILD_DOCS=False					\
		-DBUILD_PYTHON_CLIENT=False	\
		-DBUILD_FOXX=False					\
		-DBUILD_COMMON=False
RUN cmake --build build

ENV NVM_DIR="$NVM_DIR"
ENV NVM_INC="$NVM_INC"
ENV NVM_BIN="$NVM_BIN"
ENV PATH="$NVM_BIN:$PATH"

RUN cmake --build build --target install

FROM ${RUNTIME} AS ws

ARG DATAFED_NODE_VERSION=""
ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR
ARG NVM_DIR
ARG NVM_INC
ARG NVM_BIN

# The above should also be available at runtime
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV          DATAFED_DIR="$DATAFED_DIR"
ENV            BUILD_DIR="$BUILD_DIR"
ENV              NVM_DIR="$NVM_DIR"
ENV              NVM_INC="$NVM_INC"
ENV              NVM_BIN="$NVM_BIN"
ENV                 PATH="$NVM_BIN:$PATH"

RUN apt install -y python3 make g++

WORKDIR ${DATAFED_DIR}

COPY --from=ws-build --chown=datafed:root "$NVM_DIR" "$NVM_DIR" 
RUN ln -s ${DATAFED_INSTALL_PATH}/web ${DATAFED_DIR}/web

USER datafed

COPY --chown=datafed:root ./web/docker/entrypoint.sh       ${BUILD_DIR}/web/entrypoint.sh
COPY --chown=datafed:root ./scripts/generate_datafed.sh    ${DATAFED_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:root ./scripts/dependency_versions.sh ${DATAFED_DIR}/scripts/dependency_versions.sh
COPY --chown=datafed:root ./scripts/generate_ws_config.sh  ${DATAFED_DIR}/scripts/generate_ws_config.sh
COPY --chown=datafed:root ./scripts/install_ws.sh          ${DATAFED_DIR}/scripts/install_ws.sh
COPY --chown=datafed:root ./cmake/Version.cmake            ${DATAFED_DIR}/cmake/Version.cmake

COPY --from=ws-build --chown=datafed:root ${BUILD_DIR}/web/package.json ${DATAFED_INSTALL_PATH}/web/package.json
RUN . ${DATAFED_DIR}/scripts/dependency_versions.sh &&					\
	. ${DATAFED_DIR}/.nvm/nvm.sh &&							\
	npm --allow-root --unsafe-perm --prefix ${DATAFED_INSTALL_PATH}/web install

COPY --from=ws-build --chown=datafed:root ${BUILD_DIR}/web ${DATAFED_INSTALL_PATH}/web

WORKDIR ${DATAFED_INSTALL_PATH}/web
