ARG             DATAFED_DIR="/datafed"
ARG    DATAFED_INSTALL_PATH="$DATAFED_DIR/install"
ARG               GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG               BUILD_DIR="$DATAFED_DIR/source"
ARG                 NVM_DIR="$DATAFED_DIR/.nvm"
ARG                 NVM_INC="$DATAFED_DIR/.nvm/versions/node/v13.14.0/include/node"
ARG                 NVM_BIN="$DATAFED_DIR/.nvm/versions/node/v13.14.0/bin"
ARG                 LIB_DIR="/usr/local/lib"

FROM ubuntu:focal AS base

FROM base AS dependencies

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
RUN mkdir -p ${NVM_DIR}

WORKDIR ${BUILD_DIR}

# Copy install scripts
COPY ./scripts/dependency_install_functions.sh	${BUILD_DIR}/scripts/
COPY ./scripts/dependency_versions.sh						${BUILD_DIR}/scripts/
# COPY ./scripts/install_core_dependencies.sh			${BUILD_DIR}/scripts/
# COPY ./scripts/install_repo_dependencies.sh			${BUILD_DIR}/scripts/
# COPY ./scripts/install_ws_dependencies.sh				${BUILD_DIR}/scripts/
# COPY ./scripts/install_gcs.sh ${BUILD_DIR}/scripts/
# COPY ./scripts/install_authz_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_dependencies.sh ${BUILD_DIR}/scripts/

RUN echo "#!/bin/bash\n\$@" > /usr/bin/sudo && chmod +x /usr/bin/sudo

# run build scripts
# RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_core_dependencies.sh
# RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_repo_dependencies.sh
# RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_ws_dependencies.sh -n "${DATAFED_DIR}"
# RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_gcs.sh
# RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_authz_dependencies.sh
RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_dependencies.sh

COPY ./scripts/copy_dependency.sh ${BUILD_DIR}/scripts/
RUN ${BUILD_DIR}/scripts/copy_dependency.sh protobuf from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libzmq from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libsodium from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh boost_program_options from
RUN ${BUILD_DIR}/scripts/copy_dependency.sh boost_filesystem from

# RUN cp -R $HOME/.nvm ${NVM_DIR}

FROM ${GCS_IMAGE} AS gcs-base

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH

RUN mkdir -p ${BUILD_DIR}
RUN mkdir -p ${BUILD_DIR}/logs
RUN mkdir -p ${BUILD_DIR}/common/proto
RUN mkdir -p ${DATAFED_INSTALL_PATH}/authz
RUN mkdir -p ${DATAFED_DIR}/collections/mapped

RUN apt update
RUN apt install -y vim netcat

# For communicating with public
EXPOSE 443

# Needed for Globus GridFTP communication
EXPOSE 50000-51000

WORKDIR ${BUILD_DIR}

RUN adduser --disabled-password --gecos "" datafed

RUN echo "#!/bin/bash\n\$@" > /usr/bin/sudo && chmod +x /usr/bin/sudo

COPY ./scripts/dependency_versions.sh          ${BUILD_DIR}/scripts/
COPY ./scripts/dependency_install_functions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_authz_dependencies.sh   ${BUILD_DIR}/scripts/

RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_authz_dependencies.sh

FROM dependencies AS build-base

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH

RUN mkdir -p ${DATAFED_INSTALL_PATH}
RUN mkdir -p ${DATAFED_INSTALL_PATH}/keys

WORKDIR ${BUILD_DIR}

COPY ./common ${BUILD_DIR}/common

FROM build-base AS core-build

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH

# For communicating with repo server
EXPOSE 7512
# For listening to web server
EXPOSE 7513
# ArangoDB port
EXPOSE 8529

COPY ./core/CMakeLists.txt             ${BUILD_DIR}/core/CMakeLists.txt
COPY ./CMakeLists.txt                  ${BUILD_DIR}
COPY ./scripts/dependency_versions.sh  ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh     ${BUILD_DIR}/scripts/
COPY ./scripts/generate_core_config.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_core.sh         ${BUILD_DIR}/scripts/
COPY ./cmake                           ${BUILD_DIR}/cmake
COPY ./core/docker/entrypoint.sh       ${BUILD_DIR}/core/docker/
COPY ./core/server                     ${BUILD_DIR}/core/server

# All files should be owned by the datafed user
# RUN chown -R datafed:datafed ${DATAFED_DIR}
#
# USER datafed

RUN ${BUILD_DIR}/scripts/generate_datafed.sh && \
	cmake -S. -B build						\
		-DBUILD_REPO_SERVER=False		\
		-DBUILD_AUTHZ=False					\
		-DBUILD_CORE_SERVER=True		\
		-DBUILD_WEB_SERVER=False		\
		-DBUILD_DOCS=False					\
		-DBUILD_PYTHON_CLIENT=False	\
		-DBUILD_FOXX=False
RUN cmake --build build -j 8
RUN cmake --build build --target install

FROM build-base AS repo-build

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH

# This port is needed to communicate with the DataFed core server
EXPOSE 7512
# Not quite sure what 9000 is doing that 7512 isn't, difference between egress
# and ingress?
EXPOSE 9000

COPY ./repository/CMakeLists.txt               ${BUILD_DIR}/repository/CMakeLists.txt
COPY ./CMakeLists.txt                          ${BUILD_DIR}
COPY ./scripts/dependency_versions.sh          ${BUILD_DIR}/scripts/
COPY ./scripts/dependency_install_functions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh             ${BUILD_DIR}/scripts/
COPY ./scripts/generate_repo_config.sh         ${BUILD_DIR}/scripts/
COPY ./scripts/install_repo.sh                 ${BUILD_DIR}/scripts/
COPY ./cmake                                   ${BUILD_DIR}/cmake
COPY ./repository/server                       ${BUILD_DIR}/repository/server

RUN ${BUILD_DIR}/scripts/generate_datafed.sh && \
	cmake -S. -B build						\
		-DBUILD_REPO_SERVER=True		\
		-DBUILD_AUTHZ=False					\
		-DBUILD_CORE_SERVER=False		\
		-DBUILD_WEB_SERVER=False		\
		-DBUILD_DOCS=False					\
		-DBUILD_PYTHON_CLIENT=False	\
		-DBUILD_FOXX=False
RUN cmake --build build
RUN cmake --build build --target install

FROM build-base AS ws-build

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

FROM ubuntu:focal AS runtime

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR

# Create datafed user, prefer more secure login options than password
# Recommended to mount ssh public key on run
RUN adduser --disabled-password --gecos "" datafed

COPY ./scripts/dependency_versions.sh  ${BUILD_DIR}/scripts/
COPY ./scripts/copy_dependency.sh      ${BUILD_DIR}/scripts/
RUN mkdir -p ${DATAFED_DIR}
RUN mkdir -p /opt/datafed
RUN mkdir -p /var/log/datafed
RUN chown -R datafed:datafed /opt/datafed
RUN chown -R datafed:datafed /var/log/datafed
RUN chown -R datafed:datafed ${DATAFED_DIR}
WORKDIR ${DATAFED_DIR}

RUN apt update
RUN apt install -y grep libcurl4
# ENV LD_LIBRARY_PATH="$LD_LIBRARY_PATH:/usr/lib:/usr/local/lib"

FROM runtime AS core

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR
ARG LIB_DIR

# The above should also be available at runtime
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV          DATAFED_DIR="$DATAFED_DIR"
ENV            BUILD_DIR="$BUILD_DIR"
ENV              LIB_DIR="$LIB_DIR"

# copy necessary shared libraries
COPY --from=dependencies /libraries/libprotobuf.so           /libraries/libprotobuf.so
COPY --from=dependencies /libraries/libzmq.so                /libraries/libzmq.so
COPY --from=dependencies /libraries/libsodium.so             /libraries/libsodium.so
COPY --from=dependencies /libraries/libboost_program_options.so /libraries/libboost_program_options.so
RUN ${BUILD_DIR}/scripts/copy_dependency.sh protobuf to
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libzmq to
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libsodium to
RUN ${BUILD_DIR}/scripts/copy_dependency.sh boost_program_options to

RUN ldconfig

USER datafed

COPY --chown=datafed:datafed ./scripts/generate_datafed.sh     ${DATAFED_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:datafed ./scripts/generate_core_config.sh ${DATAFED_DIR}/scripts/generate_core_config.sh
COPY --chown=datafed:datafed ./scripts/install_core.sh         ${DATAFED_DIR}/scripts/install_core.sh
COPY --chown=datafed:datafed ./cmake/Version.cmake             ${DATAFED_DIR}/cmake/Version.cmake
COPY --from=core-build --chown=datafed:datafed ${BUILD_DIR}/core/docker/entrypoint.sh    ${BUILD_DIR}/core/entrypoint.sh
COPY --from=core-build --chown=datafed:datafed ${DATAFED_INSTALL_PATH}/core/datafed-core ${DATAFED_INSTALL_PATH}/core/datafed-core

# ENTRYPOINT ["/app/entrypoint.sh"]
# CMD ["/app/datafed-core","--cfg","/app/datafed-core.cfg"]

FROM runtime AS repo

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR
ARG LIB_DIR

# The above should also be available at runtime
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV          DATAFED_DIR="$DATAFED_DIR"
ENV            BUILD_DIR="$BUILD_DIR"
ENV              LIB_DIR="$LIB_DIR"

WORKDIR /datafed

# copy necessary shared libraries
COPY --from=dependencies /libraries/libprotobuf.so           /libraries/libprotobuf.so
COPY --from=dependencies /libraries/libzmq.so                /libraries/libzmq.so
COPY --from=dependencies /libraries/libsodium.so             /libraries/libsodium.so
COPY --from=dependencies /libraries/libboost_program_options.so /libraries/libboost_program_options.so
COPY --from=dependencies /libraries/libboost_filesystem.so      /libraries/libboost_filesystem.so
RUN ${BUILD_DIR}/scripts/copy_dependency.sh protobuf to
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libzmq to
RUN ${BUILD_DIR}/scripts/copy_dependency.sh libsodium to
RUN ${BUILD_DIR}/scripts/copy_dependency.sh boost_program_options to
RUN ${BUILD_DIR}/scripts/copy_dependency.sh boost_filesystem to

RUN ldconfig

USER datafed

COPY --chown=datafed:datafed ./repository/docker/entrypoint_repo.sh ${BUILD_DIR}/repository/entrypoint.sh
COPY --chown=datafed:datafed ./scripts/generate_datafed.sh          ${DATAFED_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:datafed ./scripts/generate_repo_config.sh      ${DATAFED_DIR}/scripts/generate_repo_config.sh
COPY --chown=datafed:datafed ./scripts/install_repo.sh              ${DATAFED_DIR}/scripts/install_repo.sh
COPY --chown=datafed:datafed ./cmake/Version.cmake                  ${DATAFED_DIR}/cmake/Version.cmake
COPY --from=repo-build --chown=datafed:datafed ${DATAFED_INSTALL_PATH}/repo/datafed-repo ${DATAFED_INSTALL_PATH}/repo/datafed-repo

# ENTRYPOINT ["/app/entrypoint.sh"]
# CMD ["/app/datafed-core","--cfg","/app/datafed-core.cfg"]

FROM runtime AS ws

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

WORKDIR /datafed

RUN mkdir -p /home/cades
RUN chown -R datafed:datafed /home/cades

COPY --from=dependencies --chown=datafed:datafed "$NVM_DIR" "$NVM_DIR" 
RUN ln -s ${DATAFED_INSTALL_PATH}/web ${DATAFED_DIR}/web
RUN ln -s "$NVM_DIR" /home/cades/.nvm

USER datafed

COPY --chown=datafed:datafed ./web/docker/entrypoint.sh       ${BUILD_DIR}/web/entrypoint.sh
COPY --chown=datafed:datafed ./scripts/generate_datafed.sh    ${DATAFED_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:datafed ./scripts/dependency_versions.sh ${DATAFED_DIR}/scripts/dependency_versions.sh
COPY --chown=datafed:datafed ./scripts/generate_ws_config.sh  ${DATAFED_DIR}/scripts/generate_ws_config.sh
COPY --chown=datafed:datafed ./scripts/install_ws.sh          ${DATAFED_DIR}/scripts/install_ws.sh
COPY --chown=datafed:datafed ./cmake/Version.cmake            ${DATAFED_DIR}/cmake/Version.cmake

COPY --from=ws-build --chown=datafed:datafed ${BUILD_DIR}/web/package.json ${DATAFED_INSTALL_PATH}/web/package.json
RUN . ${DATAFED_DIR}/scripts/dependency_versions.sh &&					\
	. ${DATAFED_DIR}/.nvm/nvm.sh &&							\
	npm --allow-root --unsafe-perm --prefix ${DATAFED_INSTALL_PATH}/web install

COPY --from=ws-build --chown=datafed:datafed ${BUILD_DIR}/web ${DATAFED_INSTALL_PATH}/web

WORKDIR ${DATAFED_INSTALL_PATH}/web

FROM gcs-base AS gcs-authz

ARG rebuild=true
ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH

ENV GCS_COLLECTION_ROOT_PATH="$DATAFED_DIR/collections/mapped"
ENV     DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV	             DATAFED_DIR="$DATAFED_DIR"
ENV                BUILD_DIR="$BUILD_DIR"


# All files should be owned by the datafed user
RUN chown -R datafed:datafed ${DATAFED_DIR}

COPY --chown=datafed:datafed ./scripts/dependency_versions.sh        ${BUILD_DIR}/scripts/
COPY --chown=datafed:datafed ./scripts/generate_authz_config.sh      ${BUILD_DIR}/scripts/generate_authz_config.sh
COPY --chown=datafed:datafed ./scripts/generate_datafed.sh           ${BUILD_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:datafed ./CMakeLists.txt                        ${BUILD_DIR}
COPY --chown=datafed:datafed ./cmake                                 ${BUILD_DIR}/cmake
COPY --chown=datafed:datafed ./repository/CMakeLists.txt             ${BUILD_DIR}/repository/CMakeLists.txt
COPY --chown=datafed:datafed ./repository/gridftp/CMakeLists.txt     ${BUILD_DIR}/repository/gridftp/CMakeLists.txt
COPY --chown=datafed:datafed ./scripts/globus/setup_globus.sh        ${BUILD_DIR}/scripts/globus/setup_globus.sh
COPY --chown=datafed:datafed ./scripts/globus/generate_repo_form.sh  ${BUILD_DIR}/scripts/globus/generate_repo_form.sh
COPY --chown=datafed:datafed ./repository/docker/entrypoint_authz.sh ${BUILD_DIR}/repository/docker/entrypoint_authz.sh
COPY --chown=datafed:datafed ./common                                ${BUILD_DIR}/common
COPY --chown=datafed:datafed ./repository/gridftp/globus5            ${BUILD_DIR}/repository/gridftp/globus5

# Build as if a non root user
USER datafed

RUN ${BUILD_DIR}/scripts/generate_datafed.sh

RUN ${BUILD_DIR}/scripts/generate_authz_config.sh &&	\
	cmake -S. -B build				\
		-DBUILD_REPO_SERVER=False		\
		-DBUILD_AUTHZ=True			\
		-DBUILD_CORE_SERVER=False		\
		-DBUILD_WEB_SERVER=False		\
		-DBUILD_DOCS=False			\
		-DBUILD_PYTHON_CLIENT=False		\
		-DBUILD_FOXX=False
RUN cmake --build build
RUN cmake --build build --target install

COPY ./scripts/globus/setup_globus.sh        ${BUILD_DIR}/scripts/globus/setup_globus.sh
COPY ./scripts/globus/generate_repo_form.sh  ${BUILD_DIR}/scripts/globus/generate_repo_form.sh
COPY ./repository/docker/entrypoint_authz.sh ${BUILD_DIR}/repository/docker/entrypoint_authz.sh

USER root

WORKDIR ${DATAFED_INSTALL_PATH}/authz
