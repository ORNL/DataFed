
# Version 0.2.0

## Bug fixes
1. Fixed thread safety of repo list calls in core server which where causing
seg faults
2. Added better error reporting when attempting to delete repo with running tasks.

## Feature
1. Added GitLab CI file
2. Added several files to generate configuration files
3. Added several scripts for installing dependencies
4. Added support for Globus Connect Server 5.4
5. Added log support (core server/repo server/web server) partial support in python CLI
6. Added proxy timeout capability to assist in testing
7. Added correlation ids to messages for tracking
8. Split log output into server specific files.

## Technical Debt
1. Added GitIgnore File
2. Upgraded to C++ 17 std
3. Split build and install of different DataFed components web, repo, core, foxx
4. Config files auto generated from single datafed.sh config
5. Removed most calls to sdms and replaced with datafed for consistency
6. Replaced thread pointers with threads in CoreServer.hpp
7. Moved loadRepositoryConfig from CoreServer to Config.cpp
8. Authz will look for authz file in default location if the
   DATAFED_AUTHZ_CFG_FILE env variable is not specified
9. Applied formatting, black, autopep8, js-beautify, clange-format10
10. Added pipeline script to robustly handle the provisioning of CI infrastructure
11. Added workflows to check formatting and trigger formatting if needed
12. Added tests: unit, foxx api tests, end to end tests, internal integration tests
13. Standardized versioning, applied versioning to all APIs and clients and servers
14. Secured ZeroMQ messaging
