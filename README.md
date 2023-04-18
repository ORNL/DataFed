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

Please see documentation at doc_source/source/admin/general.rst for installation instructions.

# Versions
All versions follow the semantic versioning scheme with the exception of the RELEASE version which follows a calendar release.
YEAR.MONTH.DAY.HOUR.MINUTE

# Warning

If encountering strange seg faults with zmq, it is possible that it is caused by reusing an address when creating a socket.
