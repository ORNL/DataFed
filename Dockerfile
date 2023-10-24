FROM ubuntu:focal AS base

ARG DATAFED_DIR="/datafed"
ARG BUILD_DIR="$DATAFED_DIR/source"
ARG DATAFED_INSTALL_PATH="$DATAFED_DIR/install"
ARG NVM_DIR="$DATAFED_DIR/.nvm"
ARG NVM_INC="$DATAFED_DIR/.nvm/versions/node/v13.14.0/include/node"
ARG NVM_BIN="$DATAFED_DIR/.nvm/versions/node/v13.14.0/bin"

FROM base AS dependencies

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH

RUN mkdir -p ${BUILD_DIR}
RUN mkdir -p ${BUILD_DIR}/logs
RUN mkdir -p ${BUILD_DIR}/repository/server
RUN mkdir -p ${BUILD_DIR}/common/proto

WORKDIR ${BUILD_DIR}

RUN apt-get update
RUN apt-get install -y cmake

# Copy install scripts
COPY ./scripts/dependency_install_functions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/dependency_versions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_core_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_repo_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_ws_dependencies.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_gcs.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_authz_dependencies.sh ${BUILD_DIR}/scripts/

RUN echo "#!/bin/bash\n\$@" > /usr/bin/sudo && chmod +x /usr/bin/sudo

# run build scripts
RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_core_dependencies.sh
RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_repo_dependencies.sh
RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_ws_dependencies.sh -n "${DATAFED_DIR}"
RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC ${BUILD_DIR}/scripts/install_gcs.sh
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

COPY ./core/CMakeLists.txt ${BUILD_DIR}/core/CMakeLists.txt
COPY ./CMakeLists.txt ${BUILD_DIR}
COPY ./scripts/dependency_versions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_core_config.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_core.sh ${BUILD_DIR}/scripts/
COPY ./cmake ${BUILD_DIR}/cmake
COPY ./core/docker/entrypoint.sh ${BUILD_DIR}/core/docker/
COPY ./core/server ${BUILD_DIR}/core/server

# All files should be owned by the datafed user
# RUN chown -R datafed:datafed ${DATAFED_DIR}
#
# USER datafed

RUN ${BUILD_DIR}/scripts/generate_datafed.sh
RUN cmake -S. -B build \
	-DBUILD_REPO_SERVER=False \
	-DBUILD_AUTHZ=False \
	-DBUILD_CORE_SERVER=True \
	-DBUILD_WEB_SERVER=False \
	-DBUILD_DOCS=False \
	-DBUILD_PYTHON_CLIENT=False \
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

COPY ./repository/CMakeLists.txt ${BUILD_DIR}/repository/CMakeLists.txt
COPY ./CMakeLists.txt ${BUILD_DIR}
COPY ./cmake/* ${BUILD_DIR}/cmake/
COPY ./scripts/dependency_versions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/dependency_install_functions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_repo_config.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_repo.sh ${BUILD_DIR}/scripts/
COPY ./cmake ${BUILD_DIR}/
COPY ./repository/server ${BUILD_DIR}/repository/server

RUN ${BUILD_DIR}/scripts/generate_datafed.sh
RUN cmake -S. -B build \
	-DBUILD_REPO_SERVER=True \
	-DBUILD_AUTHZ=False \
	-DBUILD_CORE_SERVER=False \
	-DBUILD_WEB_SERVER=False \
	-DBUILD_DOCS=False \
	-DBUILD_PYTHON_CLIENT=False \
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

COPY ./CMakeLists.txt ${BUILD_DIR}
COPY ./scripts/dependency_versions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_ws_config.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_ws.sh ${BUILD_DIR}/scripts/
COPY ./cmake ${BUILD_DIR}/cmake
COPY ./common/proto ${BUILD_DIR}/common/proto
COPY ./web ${BUILD_DIR}/web

RUN ${BUILD_DIR}/scripts/generate_datafed.sh
RUN cmake -S. -B build \
	-DBUILD_REPO_SERVER=False \
	-DBUILD_AUTHZ=False \
	-DBUILD_CORE_SERVER=False \
	-DBUILD_WEB_SERVER=True \
	-DBUILD_DOCS=False \
	-DBUILD_PYTHON_CLIENT=False \
	-DBUILD_FOXX=False \
	-DBUILD_COMMON=False
RUN cmake --build build

ENV NVM_DIR="$NVM_DIR"
ENV NVM_INC="$NVM_INC"
ENV NVM_BIN="$NVM_BIN"
ENV PATH="$NVM_BIN:$PATH"

RUN cmake --build build --target install

FROM base AS runtime

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR

# Create datafed user, prefer more secure login options than password
# Recommended to mount ssh public key on run
RUN adduser --disabled-password --gecos "" datafed

RUN mkdir -p /datafed
RUN mkdir -p /opt/datafed
RUN mkdir -p /var/log/datafed
RUN chown -R datafed:datafed /opt/datafed
RUN chown -R datafed:datafed /var/log/datafed
RUN chown -R datafed:datafed /datafed
WORKDIR /datafed

RUN apt update
RUN apt install -y grep libcurl4
# ENV LD_LIBRARY_PATH="$LD_LIBRARY_PATH:/usr/lib:/usr/local/lib"

FROM runtime AS core

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR

# The above should also be available at runtime
ENV DATAFED_DIR="$DATAFED_DIR"
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV BUILD_DIR="$BUILD_DIR"

# copy necessary shared libraries
# libprotobuf
COPY --from=dependencies /usr/local/lib/libprotobuf.so.3.17.3.0 /usr/local/lib/libprotobuf.so.3.17.3.0
RUN ln -s /usr/local/lib/libprotobuf.so.3.17.3.0 /usr/local/lib/libprotobuf.so

# libzmq
COPY --from=dependencies /usr/local/lib/libzmq.so.5.2.4 /usr/local/lib/libzmq.so.5.2.4
RUN ln -s /usr/local/lib/libzmq.so.5.2.4 /usr/local/lib/libzmq.so.5
RUN ln -s /usr/local/lib/libzmq.so.5 /usr/local/lib/libzmq.so

# libsodium
COPY --from=dependencies /usr/local/lib/libsodium.so.23.3.0 /usr/local/lib/libsodium.so.23.3.0
RUN ln -s /usr/local/lib/libsodium.so.23.3.0 /usr/local/lib/libsodium.so.23
RUN ln -s /usr/local/lib/libsodium.so.23 /usr/local/lib/libsodium.so

# libboost-program-options
COPY --from=dependencies /lib/x86_64-linux-gnu/libboost_program_options.so.1.71.0 /usr/local/lib/libboost_program_options.so.1.71.0
RUN ln -s /usr/local/lib/libboost_program_options.so.1.71.0 /usr/local/lib/libboost_program_options.so

RUN ldconfig

USER datafed

COPY --chown=datafed:datafed ./scripts/generate_datafed.sh /datafed/scripts/generate_datafed.sh
COPY --chown=datafed:datafed ./scripts/generate_core_config.sh /datafed/scripts/generate_core_config.sh
COPY --chown=datafed:datafed ./scripts/install_core.sh /datafed/scripts/install_core.sh
COPY --chown=datafed:datafed ./cmake/Version.cmake /datafed/cmake/Version.cmake
COPY --from=core-build --chown=datafed:datafed /datafed/source/core/docker/entrypoint.sh /datafed/source/core/entrypoint.sh
COPY --from=core-build --chown=datafed:datafed /datafed/install/core/datafed-core /datafed/install/core/datafed-core

# ENTRYPOINT ["/app/entrypoint.sh"]
# CMD ["/app/datafed-core","--cfg","/app/datafed-core.cfg"]

FROM runtime AS repo

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR

# The above should also be available at runtime
ENV DATAFED_DIR="$DATAFED_DIR"
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV BUILD_DIR="$BUILD_DIR"

WORKDIR /datafed

# copy necessary shared libraries
# libprotobuf
COPY --from=dependencies /usr/local/lib/libprotobuf.so.3.17.3.0 /usr/local/lib/libprotobuf.so.3.17.3.0
RUN ln -s /usr/local/lib/libprotobuf.so.3.17.3.0 /usr/local/lib/libprotobuf.so

# libzmq
COPY --from=dependencies /usr/local/lib/libzmq.so.5.2.4 /usr/local/lib/libzmq.so.5.2.4
RUN ln -s /usr/local/lib/libzmq.so.5.2.4 /usr/local/lib/libzmq.so.5
RUN ln -s /usr/local/lib/libzmq.so.5 /usr/local/lib/libzmq.so

# libsodium
COPY --from=dependencies /usr/local/lib/libsodium.so.23.3.0 /usr/local/lib/libsodium.so.23.3.0
RUN ln -s /usr/local/lib/libsodium.so.23.3.0 /usr/local/lib/libsodium.so.23
RUN ln -s /usr/local/lib/libsodium.so.23 /usr/local/lib/libsodium.so

# libboost-filesystem
COPY --from=dependencies /lib/x86_64-linux-gnu/libboost_filesystem.so.1.71.0 /usr/local/lib/libboost_filesystem.so.1.71.0
RUN ln -s /usr/local/lib/libboost_filesystem.so.1.71.0 /usr/local/lib/libboost_filesystem.so

# libboost-program-options
COPY --from=dependencies /lib/x86_64-linux-gnu/libboost_program_options.so.1.71.0 /usr/local/lib/libboost_program_options.so.1.71.0
RUN ln -s /usr/local/lib/libboost_program_options.so.1.71.0 /usr/local/lib/libboost_program_options.so

RUN ldconfig

USER datafed

COPY --chown=datafed:datafed ./repository/docker/entrypoint_repo.sh /datafed/source/repository/entrypoint.sh
COPY --chown=datafed:datafed ./scripts/generate_datafed.sh /datafed/scripts/generate_datafed.sh
COPY --chown=datafed:datafed ./scripts/generate_repo_config.sh /datafed/scripts/generate_repo_config.sh
COPY --chown=datafed:datafed ./scripts/install_repo.sh /datafed/scripts/install_repo.sh
COPY --chown=datafed:datafed ./cmake/Version.cmake /datafed/cmake/Version.cmake
COPY --from=repo-build --chown=datafed:datafed /datafed/install/repo/datafed-repo /datafed/install/repo/datafed-repo

# ENTRYPOINT ["/app/entrypoint.sh"]
# CMD ["/app/datafed-core","--cfg","/app/datafed-core.cfg"]

FROM runtime AS ws

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR
ARG NVM_DIR
ARG NVM_INC
ARG NVM_BIN

# The above should also be available at runtime
ENV DATAFED_DIR="$DATAFED_DIR"
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV BUILD_DIR="$BUILD_DIR"

ENV NVM_DIR="$NVM_DIR"
ENV NVM_INC="$NVM_INC"
ENV NVM_BIN="$NVM_BIN"
ENV PATH="$NVM_BIN:$PATH"

RUN apt install -y python3 make g++

WORKDIR /datafed

RUN mkdir -p /home/cades
RUN chown -R datafed:datafed /home/cades

COPY --from=dependencies --chown=datafed:datafed "$NVM_DIR" "$NVM_DIR" 
RUN ln -s /datafed/install/web /datafed/web
RUN ln -s "$NVM_DIR" /home/cades/.nvm

USER datafed

COPY --chown=datafed:datafed ./web/docker/entrypoint.sh /datafed/source/web/entrypoint.sh
COPY --chown=datafed:datafed ./scripts/generate_datafed.sh /datafed/scripts/generate_datafed.sh
COPY --chown=datafed:datafed ./scripts/dependency_versions.sh /datafed/scripts/dependency_versions.sh
COPY --chown=datafed:datafed ./scripts/generate_ws_config.sh /datafed/scripts/generate_ws_config.sh
COPY --chown=datafed:datafed ./scripts/install_ws.sh /datafed/scripts/install_ws.sh
COPY --chown=datafed:datafed ./cmake/Version.cmake /datafed/cmake/Version.cmake
COPY --from=ws-build --chown=datafed:datafed /datafed/source/web /datafed/install/web
