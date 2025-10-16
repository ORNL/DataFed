# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f repository/docker/Dockerfile .

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

FROM ${DEPENDENCIES} AS repo-build

SHELL ["/bin/bash", "-c"]
ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_ROOT
ARG DATAFED_DEPENDENCIES_INSTALL_PATH

ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
# This port is needed to communicate with the DataFed core server
EXPOSE 7512
# Not quite sure what 9000 is doing that 7512 isn't, difference between egress

# and ingress?
EXPOSE 9000

RUN mkdir -p ${DATAFED_DEPENDENCIES_ROOT}/scripts/ && \
         mv ./scripts/dependency_versions.sh          ${DATAFED_DEPENDENCIES_ROOT}/scripts/ && \
         mv ./scripts/dependency_install_functions.sh ${DATAFED_DEPENDENCIES_ROOT}/scripts/ && \
         mv ./scripts/generate_dependencies_config.sh ${DATAFED_DEPENDENCIES_ROOT}/scripts/

COPY ./common                                  ${BUILD_DIR}/common
COPY ./repository/CMakeLists.txt               ${BUILD_DIR}/repository/CMakeLists.txt
COPY ./CMakeLists.txt                          ${BUILD_DIR}
COPY ./scripts/generate_datafed.sh             ${BUILD_DIR}/scripts/
COPY ./scripts/generate_repo_config.sh         ${BUILD_DIR}/scripts/
COPY ./scripts/install_repo.sh                 ${BUILD_DIR}/scripts/
COPY ./cmake                                   ${BUILD_DIR}/cmake
COPY ./repository/server                       ${BUILD_DIR}/repository/server

RUN ${DATAFED_DEPENDENCIES_ROOT}/scripts/generate_dependencies_config.sh && \
  ${BUILD_DIR}/scripts/generate_datafed.sh && \
  ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake -S. -B build \
  -DBUILD_REPO_SERVER=True    \
  -DBUILD_AUTHZ=False         \
  -DBUILD_CORE_SERVER=False   \
  -DBUILD_WEB_SERVER=False    \
  -DBUILD_DOCS=False          \
  -DBUILD_PYTHON_CLIENT=False \
  -DBUILD_FOXX=False
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build -j 8
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build --target install

FROM ${RUNTIME} AS repo

SHELL ["/bin/bash", "-c"]
ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG BUILD_DIR
ARG LIB_DIR
ARG DATAFED_DEPENDENCIES_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_ROOT

# The above should also be available at runtime
ENV              DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV DATAFED_DEPENDENCIES_INSTALL_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
ENV  DATAFED_GCS_COLLECTION_BASE_PATH="/mnt/datafed"
ENV  DATAFED_GCS_COLLECTION_ROOT_PATH="/mnt/datafed"
ENV         DATAFED_DEPENDENCIES_ROOT="$DATAFED_DEPENDENCIES_ROOT"
ENV           DATAFED_REPO_ID_AND_DIR="home"
ENV                       DATAFED_DIR="$DATAFED_DIR"
ENV                         BUILD_DIR="$BUILD_DIR"
ENV                           LIB_DIR="$LIB_DIR"

WORKDIR ${BUILD_DIR}

COPY --from=repo-build --chown=datafed:root ${DATAFED_DEPENDENCIES_ROOT}/scripts  ${DATAFED_DEPENDENCIES_ROOT}/scripts
COPY --from=repo-build /usr/lib/x86_64-linux-gnu/libboost_program_options.so /usr/lib/x86_64-linux-gnu/libboost_program_options.so
COPY --from=repo-build /usr/lib/x86_64-linux-gnu/libboost_filesystem.so      /usr/lib/x86_64-linux-gnu/libboost_filesystem.so

RUN ldconfig

USER datafed

COPY --chown=datafed:root ./scripts/generate_datafed.sh          ${BUILD_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:root ./scripts/generate_repo_config.sh      ${BUILD_DIR}/scripts/generate_repo_config.sh
COPY --chown=datafed:root ./scripts/install_repo.sh              ${BUILD_DIR}/scripts/install_repo.sh
COPY --chown=datafed:root ./cmake/Version.cmake                  ${BUILD_DIR}/cmake/Version.cmake
COPY --chown=datafed:root ./repository/docker/entrypoint_repo.sh ${BUILD_DIR}/repository/docker/entrypoint.sh
COPY --from=repo-build --chown=datafed:root ${DATAFED_INSTALL_PATH}/repo/datafed-repo ${DATAFED_INSTALL_PATH}/repo/datafed-repo

USER root

RUN chown -R datafed:root /datafed /opt \
       ${DATAFED_DEPENDENCIES_ROOT} && \
    find ${DATAFED_DEPENDENCIES_ROOT} -type d -exec chmod 0774 {} +

ENTRYPOINT [ "/datafed/source/repository/docker/entrypoint.sh", "/opt/datafed/repo/datafed-repo","--cfg","/opt/datafed/repo/datafed-repo.cfg"]
