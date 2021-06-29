# DataFed Documentation

This "doc_source" directory contains static documentation source files in
restructured text format (rst) that, along with generated documentation, is
used to build HTML documentation in the "/docs" directory of the DataFed
project. Sphinx is used to build the HTML documentation, and when pushed to
the "docs" branch, the HTML documentation will be published to the DataFed
project's GitHub page. The documentation includes:

- General Docs - Based on static rst files in "source" sub-directory
- Python CLI - Generated from DataFed CLI
- Python API - Generated using sphinx-autoapi
- Protobuf - TBD
- C++ Source - TBD
- Web/JS Source - TBD

## Building the Documentation

The DataFed cmake build system provides a "docs" target that will build the
documentation automatically. Note that other DataFed make targets do not need
to be built in order to build just the documentation. The DataFed Python CLI
is a target dependency and will be automatically built if needed.

The following linux packages are required to build the documentation:

- cmake3
- python3
- g++
- protobuf

The following python packages are also required (pip install):

- wget
- prompt_toolkit
- zmq
- click
- protobuf
- sphinx
- sphinx-autoapi
- sphinx-rtd-theme

The process to build the DataFed documentation is as follows:

1. git clone https://github.com/ORNL/DataFed.git
2. cd DataFed
3. mkdir build
4. cd build
5. cmake ..
6. make docs

The above procedure should result in new/updated HTML files in the "/docs"
directory. To publish these files, simply commit and push them on the "docs"
branch. GitHub will publish the docs to https://ornl.github.io/DataFed. It
may take several minutes for GitHub to deploy the documentation, and it may
be necessary to flush your browser's cache to see the updates.
