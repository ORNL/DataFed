#FROM ubuntu:latest
#LABEL authors="ramirezat"

# important commands
## build the image
## NOTE: this depends on the dependency container being built already
## docker build -f Dockerfile --build-arg DEPENDENCIES="datafed-dependencies:latest" . -t dev-container:latest

## run a container named datafed-devenv
## docker run --detach --mount type=bind,src=.,dst=/DataFed/ --name datafed-devenv dev-container:latest

## attach to running container by name
## docker exec -it datafed-devenv /bin/bash

## stop container
## docker stop datafed-devenv

## remove container
## docker rm datafed-devenv

ARG DEPENDENCIES="dependencies"
ARG DATAFED_DIR="/datafed"
ARG BUILD_DIR="$DATAFED_DIR/source"
ARG DATAFED_DEPENDENCIES_INSTALL_PATH="/opt/datafed/dependencies"

FROM ${DEPENDENCIES} AS dev-env

# pull the whole project for now
#COPY .  /DataFed/
# we should instead mount it with
# docker run --detach --mount type=bind,src=.,dst=/DataFed/ --name datafed-devenv dev-container:latest

# get development dependencies
RUN sudo apt-get update && sudo apt-get upgrade -y
# node
RUN sudo apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_23.x -o nodesource_setup.sh
RUN sudo -E bash nodesource_setup.sh
RUN sudo apt-get install -y nodejs
# optional dev deps
RUN npm install tree-sitter-cli
RUN sudo apt-get install -y ripgrep python3 software-properties-common clang
# editor
RUN curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz  \
 && sudo rm -rf /opt/nvim \
 && sudo tar -C /opt -xzf nvim-linux-x86_64.tar.gz
RUN <<EOF cat >> ~/.bashrc
export PATH="$PATH:/opt/nvim-linux-x86_64/bin"
EOF
RUN git clone https://github.com/AstroNvim/template.git ~/.config/nvim
RUN rm -rf ~/.config/nvim/.git # remove git association
RUN <<EOF cat > ~/.config/nvim/lua/community.lua
---@type LazySpec
return {
 "AstroNvim/astrocommunity",
 { import = "astrocommunity.pack.bash" },
 { import = "astrocommunity.pack.cpp" },
 { import = "astrocommunity.pack.cmake" },
 { import = "astrocommunity.pack.python" },
 { import = "astrocommunity.pack.json" },
 { import = "astrocommunity.pack.typescript" }
}
EOF

WORKDIR /DataFed
# get config for core
RUN <<EOF cat > /opt/entrypoint.sh
#!/bin/bash
# Generate DataFed env
/DataFed/scripts/generate_datafed.sh

# create compile_commands.json via cmake export option
/opt/datafed/dependencies/bin/cmake -S . -B build -DBUILD_REPO_SERVER=True -DBUILD_AUTHZ=False \
  -DBUILD_CORE_SERVER=True -DBUILD_WEB_SERVER=True \
  -DBUILD_DOCS=False -DBUILD_PYTHON_CLIENT=False \
  -DBUILD_FOXX=False  \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON

# compile protobuf files into c++ code, emit to build dir
/opt/datafed/dependencies/bin/protoc-25.2.0 --proto_path=common/proto/common --cpp_out=build/common/proto/common/ common/proto/common/*.proto

exec top -b
EOF

RUN chmod u+x /opt/entrypoint.sh

# run by using nvim .

ENTRYPOINT ["/opt/entrypoint.sh"]

#ENTRYPOINT ["top", "-b"]
