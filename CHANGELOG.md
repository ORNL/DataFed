
# Version 0.2.0

## Bug fixes
1. Fixed thread safety of repo list calls in core server which where causing
seg faults

## Feature
1. Added GitLab CI file
2. Added several files to generate configuration files
3. Added several scripts for installing dependencies
4. Added support for Globus Connect Server 5.4

## Technical Debt
1. Added GitIgnore File
2. Upgraded to C++ 14 std
3. Split build and install of different DataFed components web, repo, core, foxx
4. Config files auto generated from single datafed.sh config
5. Removed most calls to sdms and replaced with datafed for consistency
6. Replaced thread pointers with threads in CoreServer.hpp
7. Moved loadRepositoryConfig from CoreServer to Config.cpp
8. Authz will look for authz file in default location if the
   DATAFED_AUTHZ_CFG_FILE env variable is not specified
