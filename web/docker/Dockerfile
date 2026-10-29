# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f web/docker/Dockerfile .
ARG                        BUILD_BASE="debian:bookworm-slim"
ARG                      DEPENDENCIES="dependencies"
ARG                           RUNTIME="runtime"
ARG                       DATAFED_DIR="/datafed"
ARG              DATAFED_INSTALL_PATH="/opt/datafed"
ARG DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"
ARG                         GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG                         BUILD_DIR="$DATAFED_DIR/source"
ARG                           LIB_DIR="/usr/local/lib"
ARG         DATAFED_DEPENDENCIES_ROOT="$BUILD_DIR/external/DataFedDependencies"

FROM ${DEPENDENCIES} AS ws-build

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_ROOT
ARG DATAFED_DEPENDENCIES_INSTALL_PATH

ENV DATAFED_INSTALL_PATH="${DATAFED_INSTALL_PATH}"
# This port is needed to communicate with the DataFed core server
EXPOSE 7513
# For communication with the public
EXPOSE 443

RUN mkdir -p ${DATAFED_DEPENDENCIES_ROOT}/scripts && \
        mv ./scripts/utils.sh                        ${DATAFED_DEPENDENCIES_ROOT}/scripts/utils.sh && \
        mv ./scripts/dependency_install_functions.sh ${DATAFED_DEPENDENCIES_ROOT}/scripts/dependency_install_functions.sh && \
        mv ./scripts/dependency_versions.sh          ${DATAFED_DEPENDENCIES_ROOT}/scripts/dependency_versions.sh && \
        mv ./scripts/generate_dependencies_config.sh ${DATAFED_DEPENDENCIES_ROOT}/scripts/generate_dependencies_config.sh

COPY ./CMakeLists.txt                 ${BUILD_DIR}
COPY ./scripts/generate_datafed.sh    ${BUILD_DIR}/scripts/
COPY ./scripts/generate_ws_config.sh  ${BUILD_DIR}/scripts/
COPY ./scripts/install_ws.sh          ${BUILD_DIR}/scripts/
COPY ./scripts/generate_web_package.cjs ${BUILD_DIR}/scripts/
COPY ./scripts/export_dependency_version.sh ${BUILD_DIR}/scripts/
COPY ./cmake                          ${BUILD_DIR}/cmake
COPY ./common/proto3                  ${BUILD_DIR}/common/proto3
COPY ./web                            ${BUILD_DIR}/web
COPY ./external/DataFedDependencies/web/package.json ${DATAFED_DEPENDENCIES_ROOT}/web/package.json
COPY ./external/DataFedDependencies/web/zeromq-compat ${DATAFED_DEPENDENCIES_ROOT}/web/zeromq-compat

RUN ${DATAFED_DEPENDENCIES_ROOT}/scripts/generate_dependencies_config.sh && \
        ${BUILD_DIR}/scripts/generate_datafed.sh && \
        ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake -S. -B build \
          -DBUILD_REPO_SERVER=False    \
          -DBUILD_AUTHZ=False          \
          -DBUILD_CORE_SERVER=False    \
          -DBUILD_WEB_SERVER=True      \
          -DBUILD_DOCS=False           \
          -DBUILD_PYTHON_CLIENT=False  \
          -DBUILD_FOXX=False           \
          -DBUILD_COMMON=False         \
          -DENABLE_INTEGRATION_TESTS=False
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build --target install
# Resolve the application manifest and security overrides rather than retaining
# a dependency image's older node_modules tree. Keep dev modules for ws-build's
# unit-test entrypoint; the final stage prunes them.
RUN . "${DATAFED_DEPENDENCIES_ROOT}/scripts/dependency_versions.sh" && \
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm" && \
    . "$NVM_DIR/nvm.sh" && nvm use "$DATAFED_NODE_VERSION" && \
    npm --prefix "${BUILD_DIR}/web" install --install-links

ENTRYPOINT ["/opt/datafed/dependencies/bin/cmake", "--build", "build", "--target", "test"]

FROM ${RUNTIME} AS ws

SHELL ["/bin/bash", "-c"]
ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR
ARG DATAFED_DEPENDENCIES_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_ROOT

# The above should also be available at runtime
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV DATAFED_DEPENDENCIES_INSTALL_PATH="$DATAFED_DEPENDENCIES_INSTALL_PATH"
ENV DATAFED_DEPENDENCIES_ROOT="$DATAFED_DEPENDENCIES_ROOT"
ENV          DATAFED_DIR="$DATAFED_DIR"
ENV            BUILD_DIR="$BUILD_DIR"
ENV          DATAFED_DEFAULT_LOG_PATH="$DATAFED_INSTALL_PATH/logs"

WORKDIR ${DATAFED_DIR}

USER datafed

RUN mkdir -p ${DATAFED_DEFAULT_LOG_PATH}; chown root:datafed ${DATAFED_DEFAULT_LOG_PATH}; chmod -R g+rw ${DATAFED_DEFAULT_LOG_PATH}

COPY --chown=datafed:root ./scripts/generate_datafed.sh             ${BUILD_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:root ./scripts/export_dependency_version.sh    ${BUILD_DIR}/scripts/export_dependency_version.sh
COPY --chown=datafed:root ./scripts/generate_ws_config.sh           ${BUILD_DIR}/scripts/generate_ws_config.sh
COPY --chown=datafed:root ./scripts/install_ws.sh                   ${BUILD_DIR}/scripts/install_ws.sh
COPY --chown=datafed:root ./cmake/Version.cmake                     ${BUILD_DIR}/cmake/Version.cmake

COPY --from=ws-build --chown=datafed:root ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm
COPY --from=ws-build --chown=datafed:root ${BUILD_DIR}/web ${BUILD_DIR}/web
COPY --from=ws-build --chown=datafed:root ${DATAFED_DEPENDENCIES_ROOT}/scripts ${DATAFED_DEPENDENCIES_ROOT}/scripts
COPY --from=ws-build --chown=datafed:root ${DATAFED_INSTALL_PATH}/web ${DATAFED_INSTALL_PATH}/web

WORKDIR ${BUILD_DIR}/web

USER root

# The runtime needs Node and production application modules, not npm's bundled
# dependency tree or the web unit-test dependencies. Keep the source entrypoint's
# module resolution pointed at the same production modules as the installed app.
RUN . "${DATAFED_DEPENDENCIES_ROOT}/scripts/dependency_versions.sh" && \
    export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm" && \
    . "$NVM_DIR/nvm.sh" && nvm use "$DATAFED_NODE_VERSION" && \
    npm --prefix "${BUILD_DIR}/web" prune --omit=dev --ignore-scripts && \
    ln -s "${BUILD_DIR}/web/node_modules" "${DATAFED_INSTALL_PATH}/web/node_modules" && \
    rm -rf ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm/versions/node/*/lib/node_modules \
           ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm/versions/node/*/bin/npm \
           ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm/versions/node/*/bin/npx \
           ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm/.cache \
           ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm/.git \
           ${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm/test

ENTRYPOINT ["/datafed/source/web/docker/entrypoint.sh"]
CMD ["/datafed/source/web/datafed-ws.js", "/datafed/source/config/datafed-ws.cfg"]
