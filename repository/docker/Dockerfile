# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f repository/docker/Dockerfile .

ARG           BUILD_BASE="debian:bookworm-slim"
ARG         DEPENDENCIES="dependencies"
ARG              RUNTIME="runtime"
ARG          DATAFED_DIR="/datafed"
ARG DATAFED_INSTALL_PATH="/opt/datafed"
ARG DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"
ARG            GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG            BUILD_DIR="$DATAFED_DIR/source"
ARG              LIB_DIR="/usr/local/lib"

FROM ${DEPENDENCIES} AS repo-build

SHELL ["/bin/bash", "-c"]
ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_INSTALL_PATH

ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
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
	${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake -S. -B build						\
	-DBUILD_REPO_SERVER=True		\
	-DBUILD_AUTHZ=False					\
	-DBUILD_CORE_SERVER=False		\
	-DBUILD_WEB_SERVER=False		\
	-DBUILD_DOCS=False					\
	-DBUILD_PYTHON_CLIENT=False	\
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

# The above should also be available at runtime
ENV              DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV DATAFED_DEPENDENCIES_INSTALL_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
ENV  DATAFED_GCS_COLLECTION_BASE_PATH="/mnt/datafed"
ENV  DATAFED_GCS_COLLECTION_ROOT_PATH="/mnt/datafed"
ENV           DATAFED_REPO_ID_AND_DIR="home"
ENV                       DATAFED_DIR="$DATAFED_DIR"
ENV                         BUILD_DIR="$BUILD_DIR"
ENV                           LIB_DIR="$LIB_DIR"

WORKDIR /datafed

COPY --from=repo-build /usr/lib/x86_64-linux-gnu/libboost_program_options.so /usr/lib/x86_64-linux-gnu/libboost_program_options.so
COPY --from=repo-build /usr/lib/x86_64-linux-gnu/libboost_filesystem.so      /usr/lib/x86_64-linux-gnu/libboost_filesystem.so

RUN ldconfig

USER datafed

COPY --chown=datafed:root ./scripts/generate_datafed.sh          ${DATAFED_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:root ./scripts/generate_repo_config.sh      ${DATAFED_DIR}/scripts/generate_repo_config.sh
COPY --chown=datafed:root ./scripts/install_repo.sh              ${DATAFED_DIR}/scripts/install_repo.sh
COPY --chown=datafed:root ./cmake/Version.cmake                  ${DATAFED_DIR}/cmake/Version.cmake
COPY --chown=datafed:root ./repository/docker/entrypoint_repo.sh ${BUILD_DIR}/repository/entrypoint.sh
COPY --from=repo-build --chown=datafed:root ${DATAFED_INSTALL_PATH}/repo/datafed-repo ${DATAFED_INSTALL_PATH}/repo/datafed-repo

USER root

RUN chown -R datafed:root /datafed
RUN chown -R datafed:root /opt

ENTRYPOINT [ "/datafed/source/repository/entrypoint.sh", "/opt/datafed/repo/datafed-repo","--cfg","/opt/datafed/repo/datafed-repo.cfg"]
