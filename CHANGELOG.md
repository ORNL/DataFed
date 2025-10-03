# Pre-release

## MAJOR Breaking changes
1. [1336] - Changed base container for all builds to debian:bookworm-slim and addressed a majority of CVEs.

## MINOR Feature
1. [987] - This implements serialized GitLab CI pipelines
2. [918] - Add admin script for making a user an admin
3. [1009] - Add collections to database for holding Globus tokens. 
4. [1002] - Add backoff for task worker when database fails to prevent log overflow.
5. [1109] - Add support for Globus token association to Globus collection and user.
6. [1215] - Add support for fetching Globus tokens associated with Globus collection and user.
7. [1214] - Add support for mapped collections on transfer tasks

## PATCH Bug fixes/Technical Debt/Documentation
1. [984] - Fixes {server_default} from showing up in path.
2. [990] - Will stop running containers so that we can prune them.
3. [988] - Removed non-working subscribe function.
4. [958] - Addresses issues raised by static code analyzer.
5. [962] - Adds script that will check that docker image is in registry
6. [1015] - Uses abs path to ci pipeline script for gcs build jobs
7. [1013] - add set +e and set -e around is active check for arango service
8. [1011] - Add python script and ci job to clean up GCS node keys.
9. [1023] - Address unbound variables in harbor ci script.
10. [1027] - Fix clear_db.sh script by replacing console.log with print
11. [1012] - Allow customized base build image for Docker dependencies and runtime Dockerfiles
12. [986] - Design improvement to upload and download transfer box.
13. [985] - Handles longer than needed timeouts on ui pages.
14. [1053] - Set CMake to enable foxx tests when built in the CI.
15. [1086] - Address XML-RPC bug from deprecated client
16. [1149] - Docker container GCS Collection Mount Bug Fix
17. [1168] - Add authz unit testing to the CI
18. [1200] - Add JavaScript linter (eslint) and (prettier) formatter for JavaScript
19. [1180] - Refactor of authz foxx module, split into objects and added unit tests
20. [1223] - Fix deprecated method usage for Protobuf in Python client library
21. [1257] - Bug in authz library parsing of authz.conf file, globus paths incorrectly sanitized when using just '/'
22. [1255] - Fixes bug, in libauthz with log_path var not being read in from config file.
23. [1268] - Bug fixes unbound variable in foxx entrypoint file.
24. [1269] - Update Arangodb to 3.12.4
25. [1288] - Bug Jupyter Notebook in documentation were fixed.
26. [1321] - Refactor, allow core config threads via env vars

# v2024.6.17.10.40

## MAJOR Breaking changes

## MINOR Feature

1. [912] - Adds initial compose file and docker files for python-client
2. [909] - Added Support for Google Analytics
3. [916] - Reworked Docker build process to be faster and produce simpler and
   smaller images
4. [912] - Adding working compose instance for core metadata services.
5. [937] - Working metadata services running together as part of CI
6. [946] - Added docker compose for DataFed Repository and for Metadata Services
7. [955] - Adds repo pieces to CI with working end-to-end tests
8. [973] - Adds log output at the end of CI test pipeline
9. [968] - Adds the ability to specify both base and root path when creating
   Globus collections.
10. [1003] - Updated admin install documentation.
11. [1005] - Consolidate Development Environment setup documentation.
12. [970] - Adds Web UI testing to the CI pipeline.

## PATCH Bug fixes/Technical Debt/Documentation

1. [914] - Improve GitHub template
2. [910] - Static code analysis and status checks fixed, improvements to CI
3. [923] - Fixed missing flag in certificate refresh script
4. [917] - Add additional files to .gitignore
5. [915] - Refactor CI to use pipelines Gitlab feature along with pipelines
6. [927] - Add vim swp files to .gitignore
7. [935] - Fixed CI branching with dynamic children, swiched to Harbor registry.
   Moved Blake's files into the correct folders.
8. [924] - Fix log messaging format in web server
9. [948] - Bug in getProjectId fixed, better handling of env variables in
   python.
10. [952] - Bug in globus cleanup python script fixed, was trying to use projects
    instead of the auth_client.
11. [953] - Refactored docker compose build scripts to address technical debt
12. [957] - Updated ArangoDB version used in compose file.
13. [956] - Adds improved error message, when paths of repo don't align.
14. [966] - CI refactor check that containers exist if not force build for branch.
15. [968] - Fixes bug by creating distinction between base and root path.
16. [981] - Fixes html injection that can occur from user name when displaying owner in schema dlg box.
17. [983] - Fixes google analytics by adding nonce which was broken.
18. [995] - Fixes issue with project and user folders in repo being created under root user permissions.
19. [994] - Fixes issue with spaces not being preserved in shell scripts from docker compose .env file.
20. [996] - Fixes bug in lego install script where function name had additional s
21. [998] - Fixing missing :latest tag on push in container, in common.yml of ci files
22. [999] - Fixes repo service entrypoint script to append to log file instead of rewriting

# v2023.10.23.15.50

## MINOR Feature

1. [906] - Added backup and cert refresh scripts.

## PATCH Bug Fixes/Technical Debt/Documentation

1. [911] - Add GitHub template
2. [913] - Fixed bug, when endpoint info returns an empty array check to see
   if array is empty before accessing elements

# v2023.8.21.10.40

## MAJOR Breaking changes

1. [879] - Secured ZeroMQ messaging

## MINOR Feature

1. [879] - Added GitLab CI file
2. [879] - Added several files to generate configuration files
3. [879] - Added several scripts for installing dependencies
4. [879] - Added support for Globus Connect Server 5.4
5. [879] - Added log support (core server/repo server/web server) partial
   support in python CLI
6. [879] - Added proxy timeout capability to assist in testing
7. [879] - Added correlation ids to messages for tracking
8. [879] - Split log output into server specific files.

## PATCH Bug Fixes/Technical Debt/Documentation

1. [879] - Fixed thread safety of repo list calls in core server which where
   causing seg faults
2. [879] - Added better error reporting when attempting to delete repo with
   running tasks.
3. [879] - Added GitIgnore File
4. [879] - Upgraded to C++ 17 std
5. [879] - Split build and install of different DataFed components web, repo,
   core, foxx
6. [879] - Config files auto generated from single datafed.sh config
7. [879] - Removed most calls to sdms and replaced with datafed for consistency
8. [879] - Replaced thread pointers with threads in CoreServer.hpp
9. [879] - Moved loadRepositoryConfig from CoreServer to Config.cpp
10. [879] - Authz will look for authz file in default location if the
    DATAFED_AUTHZ_CFG_FILE env variable is not specified
11. [879] - Applied formatting, black, autopep8, js-beautify, clange-format10
12. [879] - Added pipeline script to robustly handle the provisioning of CI
    infrastructure
13. [879] - Added workflows to check formatting and trigger formatting if needed
14. [879] - Added tests: unit, foxx api tests, end to end tests, internal
    integration tests
15. [879] - Standardized versioning, applied versioning to all APIs and clients
    and servers
