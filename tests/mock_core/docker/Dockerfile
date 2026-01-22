# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f tests/mock_core/docker/Dockerfile .

ARG                        BUILD_BASE="debian:bookworm-slim"
ARG                      DEPENDENCIES="dependencies"
ARG                           RUNTIME="runtime"
ARG                       DATAFED_DIR="/datafed"
ARG              DATAFED_INSTALL_PATH="/opt/datafed"
ARG DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"
ARG                         BUILD_DIR="$DATAFED_DIR/source"
ARG         DATAFED_DEPENDENCIES_ROOT="$BUILD_DIR/external/DataFedDependencies"
ARG                         GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG                           LIB_DIR="/usr/local/lib"

FROM ${DEPENDENCIES} AS mock-core-build

SHELL ["/bin/bash", "-c"]

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_ROOT

ENV DATAFED_INSTALL_PATH="${DATAFED_INSTALL_PATH}"
# For communicating with repo server
EXPOSE 7512
# For listening to web server
EXPOSE 7513

RUN mkdir -p ${DATAFED_DEPENDENCIES_ROOT}/scripts/ && \
  mv ./scripts/dependency_versions.sh          ${DATAFED_DEPENDENCIES_ROOT}/scripts/ && \
  mv ./scripts/generate_dependencies_config.sh ${DATAFED_DEPENDENCIES_ROOT}/scripts/

COPY ./common                          ${BUILD_DIR}/common
COPY ./CMakeLists.txt                  ${BUILD_DIR}
COPY ./scripts/generate_datafed.sh     ${BUILD_DIR}/scripts/
COPY ./scripts/install_mock_core.sh         ${BUILD_DIR}/scripts/
COPY ./cmake                           ${BUILD_DIR}/cmake
COPY ./tests/mock_core/docker/entrypoint.sh       ${BUILD_DIR}/tests/mock_core/docker/
COPY ./tests/mock                     ${BUILD_DIR}/tests/mock
COPY ./tests/mock_core/source                     ${BUILD_DIR}/tests/mock_core/source/
COPY ./tests/CMakeLists.txt                     ${BUILD_DIR}/tests/CMakeLists.txt

RUN ${DATAFED_DEPENDENCIES_ROOT}/scripts/generate_dependencies_config.sh && \
    ${BUILD_DIR}/scripts/generate_datafed.sh && \
    ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake -S. -B build \
      -DBUILD_REPO_SERVER=False \
      -DBUILD_AUTHZ=False \
      -DBUILD_CORE_SERVER=False \
      -DBUILD_WEB_SERVER=False \
      -DBUILD_DOCS=False \
      -DBUILD_PYTHON_CLIENT=False \
      -DBUILD_FOXX=False \
      -DBUILD_MOCK_CORE_SERVER=True \
      -DINSTALL_MOCK_CORE_SERVER=True \
      -DENABLE_INTEGRATION_TESTS=True \
      -DBUILD_COMMON=True
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build -j 8
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build --target install

FROM ${RUNTIME} AS mock-core

SHELL ["/bin/bash", "-c"]

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_ROOT
ARG DATAFED_DEPENDENCIES_INSTALL_PATH
ARG BUILD_DIR
ARG LIB_DIR

# The above should also be available at runtime
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV DATAFED_DEPENDENCIES_INSTALL_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
ENV DATAFED_DEPENDENCIES_ROOT="${DATAFED_DEPENDENCIES_ROOT}"
ENV          DATAFED_DIR="$DATAFED_DIR"
ENV            BUILD_DIR="$BUILD_DIR"
ENV              LIB_DIR="$LIB_DIR"
ENV          DATAFED_DEFAULT_LOG_PATH="$DATAFED_INSTALL_PATH/logs"

RUN ldconfig

USER datafed

COPY --chown=datafed:root ./scripts/generate_datafed.sh     ${BUILD_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:root ./scripts/install_mock_core.sh         ${BUILD_DIR}/scripts/install_mock_core.sh
COPY --chown=datafed:root ./cmake/Version.cmake             ${BUILD_DIR}/cmake/Version.cmake
COPY --from=mock-core-build --chown=datafed:root ${BUILD_DIR}/tests/mock_core/docker/entrypoint.sh    ${BUILD_DIR}/tests/mock_core/docker/entrypoint.sh
COPY --from=mock-core-build --chown=datafed:root ${DATAFED_DEPENDENCIES_ROOT}/scripts      ${DATAFED_DEPENDENCIES_ROOT}/scripts
COPY --from=mock-core-build --chown=datafed:root ${DATAFED_INSTALL_PATH}/tests/mock_core/source/datafed-mock-core ${DATAFED_INSTALL_PATH}/tests/mock_core/source/datafed-mock-core

USER root

RUN chown -R datafed:root ${DATAFED_DIR} /opt /home/datafed \
                 ${DATAFED_DEPENDENCIES_ROOT} && \
    chmod 774 ${DATAFED_DIR} ${BUILD_DIR} ${BUILD_DIR}/tests/mock_core/docker/entrypoint.sh \
                 ${DATAFED_INSTALL_PATH}/tests/mock_core/source/datafed-mock-core \
                 ${BUILD_DIR}/scripts/generate_datafed.sh \
                 ${BUILD_DIR}/scripts/install_mock_core.sh \
                 ${DATAFED_INSTALL_PATH}/tests/mock_core/source && \
    find ${DATAFED_DEPENDENCIES_ROOT} -type d -exec chmod 0774 {} + && \
    chmod 664 ${BUILD_DIR}/cmake/Version.cmake && \
    chmod +t ${DATAFED_DIR} ${DATAFED_INSTALL_PATH}

USER datafed
# NOTE docker does not recognize curly braces around variables in entrypoint
# and CMD
ENTRYPOINT [ "/datafed/source/tests/mock_core/docker/entrypoint.sh", "/opt/datafed/tests/mock_core/source/datafed-mock-core", "--cred-dir", "/opt/datafed/keys/"]
