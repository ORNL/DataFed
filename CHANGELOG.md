# Pre-release

## MAJOR Breaking changes

## PATCH Bug Fixes/Technical Debt/Documentation

# v2023.10.23.15.50

## MINOR Feature
1. [906] - Added backup and cert refresh scripts. 

## PATCH Bug Fixes/Technical Debt/Documentation
1. [911] - Add GitHub template
2. [913] - Fixed bug, when endpoint info returns an empty array check to seee if array is empty before accessing elements

# v2023.8.21.10.40

## MAJOR Breaking changes
1. [879] - Secured ZeroMQ messaging

## MINOR Feature
1. [879] - Added GitLab CI file
2. [879] - Added several files to generate configuration files
3. [879] - Added several scripts for installing dependencies
4. [879] - Added support for Globus Connect Server 5.4
5. [879] - Added log support (core server/repo server/web server) partial support in python CLI
6. [879] - Added proxy timeout capability to assist in testing
7. [879] - Added correlation ids to messages for tracking
8. [879] - Split log output into server specific files.

## PATCH Bug Fixes/Technical Debt/Documentation
1. [879] - Fixed thread safety of repo list calls in core server which where causing
seg faults
2. [879] - Added better error reporting when attempting to delete repo with running tasks.
3. [879] - Added GitIgnore File
4. [879] - Upgraded to C++ 17 std
5. [879] - Split build and install of different DataFed components web, repo, core, foxx
6. [879] - Config files auto generated from single datafed.sh config
7. [879] - Removed most calls to sdms and replaced with datafed for consistency
8. [879] - Replaced thread pointers with threads in CoreServer.hpp
9. [879] - Moved loadRepositoryConfig from CoreServer to Config.cpp
10. [879] - Authz will look for authz file in default location if the
    DATAFED_AUTHZ_CFG_FILE env variable is not specified
11. [879] - Applied formatting, black, autopep8, js-beautify, clange-format10
12. [879] - Added pipeline script to robustly handle the provisioning of CI infrastructure
13. [879] - Added workflows to check formatting and trigger formatting if needed
14. [879] - Added tests: unit, foxx api tests, end to end tests, internal integration tests
15. [879] - Standardized versioning, applied versioning to all APIs and clients and servers
