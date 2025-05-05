# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f web/docker/Dockerfile .
ARG           BUILD_BASE="ubuntu:focal"
ARG         DEPENDENCIES="dependencies"
ARG              RUNTIME="runtime"
ARG          DATAFED_DIR="/datafed"
ARG DATAFED_INSTALL_PATH="/opt/datafed"
ARG DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"
ARG            GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG            BUILD_DIR="$DATAFED_DIR/source"
ARG              LIB_DIR="/usr/local/lib"

FROM ${DEPENDENCIES} AS ws-build

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_INSTALL_PATH

ENV DATAFED_INSTALL_PATH="${DATAFED_INSTALL_PATH}"
# This port is needed to communicate with the DataFed core server
EXPOSE 7513
# For communication with the public
EXPOSE 443

COPY ./CMakeLists.txt                 ${BUILD_DIR}
COPY ./scripts/dependency_versions.sh ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh    ${BUILD_DIR}/scripts/
COPY ./scripts/generate_ws_config.sh  ${BUILD_DIR}/scripts/
COPY ./scripts/install_ws.sh          ${BUILD_DIR}/scripts/
COPY ./scripts/export_dependency_version.sh ${BUILD_DIR}/scripts/
COPY ./cmake                          ${BUILD_DIR}/cmake
COPY ./common/proto                   ${BUILD_DIR}/common/proto
COPY ./web                            ${BUILD_DIR}/web

RUN ${BUILD_DIR}/scripts/generate_datafed.sh && \
	${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake -S. -B build						\
		-DBUILD_REPO_SERVER=False		\
		-DBUILD_AUTHZ=False					\
		-DBUILD_CORE_SERVER=False		\
		-DBUILD_WEB_SERVER=True			\
		-DBUILD_DOCS=False					\
		-DBUILD_PYTHON_CLIENT=False	\
		-DBUILD_FOXX=False					\
		-DBUILD_COMMON=False
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build --target install
# Only part of the final install can be done here

ENTRYPOINT ["/opt/datafed/dependencies/bin/cmake", "--build", "build", "--target", "test"]

FROM ${RUNTIME} AS ws

SHELL ["/bin/bash", "-c"]
ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR
ARG DATAFED_DEPENDENCIES_INSTALL_PATH

# The above should also be available at runtime
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV DATAFED_DEPENDENCIES_INSTALL_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH"
ENV          DATAFED_DIR="$DATAFED_DIR"
ENV            BUILD_DIR="$BUILD_DIR"
ENV          DATAFED_DEFAULT_LOG_PATH="$DATAFED_INSTALL_PATH/logs"

RUN apt install -y make g++

WORKDIR ${DATAFED_DIR}

USER datafed

COPY --chown=datafed:root ./scripts/generate_datafed.sh          ${BUILD_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:root ./scripts/dependency_versions.sh       ${BUILD_DIR}/scripts/dependency_versions.sh
COPY --chown=datafed:root ./scripts/dependency_install_functions.sh ${BUILD_DIR}/scripts/dependency_install_functions.sh
COPY --chown=datafed:root ./scripts/generate_ws_config.sh        ${BUILD_DIR}/scripts/generate_ws_config.sh
COPY --chown=datafed:root ./scripts/install_ws.sh                ${BUILD_DIR}/scripts/install_ws.sh
COPY --chown=datafed:root ./cmake/Version.cmake                  ${BUILD_DIR}/cmake/Version.cmake
COPY --chown=datafed:root ./scripts/utils.sh                     ${BUILD_DIR}/scripts/utils.sh
COPY --chown=datafed:root ./scripts/export_dependency_version.sh ${BUILD_DIR}/scripts/export_dependency_version.sh
COPY --from=ws-build --chown=datafed:root ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm
COPY --from=ws-build --chown=datafed:root ${BUILD_DIR}/web ${BUILD_DIR}/web
COPY --from=ws-build --chown=datafed:root ${DATAFED_INSTALL_PATH}/web ${DATAFED_INSTALL_PATH}/web
COPY --from=ws-build --chown=datafed:root /usr/bin/curl /usr/bin/curl

WORKDIR ${BUILD_DIR}

USER root

ENTRYPOINT ["/datafed/source/web/docker/entrypoint.sh"]
CMD ["/datafed/source/web/datafed-ws.js", "/datafed/source/config/datafed-ws.cfg"]
