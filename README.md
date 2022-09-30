DataFed is a federated scientific data management system, supporting cross-facility research activities including experimentation, simulation, and/or analytics. DataFed provides the software service infrastructure needed to build a loosely-couple data network between geographically distributed and heterogeneous facilities. Within this DataFed network, access to data is simple and uniform regardless of physical storage location, local environment type, or security policies.

DataFed includes a suite of services that are built from code housed in this repository:
- Core Service - Central service providing record and metadata management as well as orchestration
- Core Database - Central database containing records, metadata, and relationships - everything but raw data
- Repository Service - Data repository management service (co-located with raw data storage)
- Globus Auth-N Module - GridFTP custom authorization module that interfaces with core service
- Web Service - Web server hosting the DataFed Web Portal - includes core proxy service
- Web Portal Application - The primary point-of-presence and user interface for DataFed
- Command Line Interface - Utility for accessing data from compute and data environments (interactive and scriptable)


Please refer to the [DataFed homepage](https://ornl.github.io/DataFed) for full
documentation, papers, and presentations describing the architecture and use
cases of DataFed.

Refer to the "BUILD.md" file for instructions on how to configure and build DataFed.

# Installation Core Server and Web Server

First, you will need to configure the datafed.sh file in the /config folder.
Next simply running the commands

```bash
./scripts/install_dependencies.sh
./scripts/generate_core_config.sh
./scripts/generate_ws_config.sh
cmake -S. -B build
cmake --build build -j4
sudo cmake --build build --target install
```

# Installation of Repo Server

Before installing DataFed you need to first configure the Globus Connect Server
correctly. 

For a Globus 5 server you will need to follow instructions
[here](https://docs.globus.org/globus-connect-server/v5/quickstart/) at least
up to the point where you need to create collections and and storage gateways,
the below script will handle that component.


```bash
./scripts/globus/setup_globus.sh
```

```bash
./scripts/generate_repo_config.sh
./scripts/generate_authz_config.sh
cmake -S. -B build -DINSTALL_REPO_SERVER=ON -DINSTALL_AUTHZ=ON -DINSTALL_CORE_SERVICE=OFF -DINSTALL_WEB_SERVICE=OFF -DINSTALL_FOXX=OFF
cmake --build build -j4
sudo cmake --build build --target install
```

Will be installed at this point but, we will need to copy the 
datafed-core-key.pub to /opt/datafed/keys before the repo
server will work. Then restart the repo service.

```bash
sudo systemctl restart datafed-repo.service
```

## Configuring DataFed Repository on Web UI

You will need to add the repository and supply it with a few items.

1. The repo servers address and port which should have the form
tcp://datafed-repo.ornl.gov:9000, the repo server should have a fully
qualified domain name and publily accessible IP address. The port should be the
same port listed in the datafed-repo.cfg file.

2. When registering the repository server you will also need to provide the
   datafed repository servers public key which should be automatically
generated and installed in /opt/datafed/keys/datafed-repo-key.pub.
