# NOTE this image must be built with respect to the base of the project i.e.
# cd ${PROJECT_ROOT} or cd DataFed
# docker build -f core/docker/Dockerfile .

ARG           BUILD_BASE="ubuntu:focal"
ARG         DEPENDENCIES="dependencies"
ARG              RUNTIME="runtime"
ARG          DATAFED_DIR="/datafed"
ARG DATAFED_INSTALL_PATH="/opt/datafed"
ARG DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"
ARG            GCS_IMAGE="code.ornl.gov:4567/dlsw/datafed/gcs-ubuntu-focal"
ARG            BUILD_DIR="$DATAFED_DIR/source"
ARG              LIB_DIR="/usr/local/lib"

FROM ${DEPENDENCIES} AS core-build

SHELL ["/bin/bash", "-c"]

ARG DATAFED_DIR
ARG BUILD_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_INSTALL_PATH

ENV DATAFED_INSTALL_PATH="${DATAFED_INSTALL_PATH}"
# For communicating with repo server
EXPOSE 7512
# For listening to web server
EXPOSE 7513

COPY ./core/CMakeLists.txt             ${BUILD_DIR}/core/CMakeLists.txt
COPY ./CMakeLists.txt                  ${BUILD_DIR}
COPY ./scripts/dependency_versions.sh  ${BUILD_DIR}/scripts/
COPY ./scripts/generate_datafed.sh     ${BUILD_DIR}/scripts/
COPY ./scripts/generate_core_config.sh ${BUILD_DIR}/scripts/
COPY ./scripts/install_core.sh         ${BUILD_DIR}/scripts/
COPY ./cmake                           ${BUILD_DIR}/cmake
COPY ./core/docker/entrypoint.sh       ${BUILD_DIR}/core/docker/
COPY ./core/server                     ${BUILD_DIR}/core/server

RUN ${BUILD_DIR}/scripts/generate_datafed.sh && \
	${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake -S. -B build						\
		-DBUILD_REPO_SERVER=False		\
		-DBUILD_AUTHZ=False					\
		-DBUILD_CORE_SERVER=True		\
		-DBUILD_WEB_SERVER=False		\
		-DBUILD_DOCS=False					\
		-DBUILD_PYTHON_CLIENT=False	\
		-DBUILD_FOXX=False \
        -DCMAKE_BUILD_TYPE=Debug
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build -j 8
RUN ${DATAFED_DEPENDENCIES_INSTALL_PATH}/bin/cmake --build build --target install

FROM ${RUNTIME} AS core

SHELL ["/bin/bash", "-c"]

ARG DATAFED_DIR
ARG DATAFED_INSTALL_PATH
ARG DATAFED_DEPENDENCIES_INSTALL_PATH
ARG BUILD_DIR
ARG LIB_DIR

# The above should also be available at runtime
ENV DATAFED_INSTALL_PATH="$DATAFED_INSTALL_PATH"
ENV DATAFED_DEPENDENCIES_INSTALL_PATH="${DATAFED_DEPENDENCIES_INSTALL_PATH}"
ENV          DATAFED_DIR="$DATAFED_DIR"
ENV            BUILD_DIR="$BUILD_DIR"
ENV              LIB_DIR="$LIB_DIR"
ENV          DATAFED_DEFAULT_LOG_PATH="$DATAFED_INSTALL_PATH/logs"

RUN ldconfig

USER datafed

COPY --chown=datafed:root ./scripts/generate_datafed.sh     ${BUILD_DIR}/scripts/generate_datafed.sh
COPY --chown=datafed:root ./scripts/generate_core_config.sh ${BUILD_DIR}/scripts/generate_core_config.sh
COPY --chown=datafed:root ./scripts/install_core.sh         ${BUILD_DIR}/scripts/install_core.sh
COPY --chown=datafed:root ./cmake/Version.cmake             ${BUILD_DIR}/cmake/Version.cmake
COPY --from=core-build --chown=datafed:root ${BUILD_DIR}/core/docker/entrypoint.sh    ${BUILD_DIR}/core/docker/entrypoint.sh
COPY --from=core-build --chown=datafed:root ${DATAFED_INSTALL_PATH}/core/datafed-core ${DATAFED_INSTALL_PATH}/core/datafed-core

USER root

RUN chown -R datafed:root /datafed
RUN chown -R datafed:root /opt

#Delete later:
RUN apt-get install -y valgrind

# NOTE docker does not recognize curly braces around variables in entrypoint
# and CMD
ENTRYPOINT [ "/datafed/source/core/docker/entrypoint.sh", "/opt/datafed/core/datafed-core","--cfg", "/opt/datafed/core/datafed-core.cfg"]
