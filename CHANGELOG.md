# Changelog

New release entries are based on the [GitHub releases page](https://github.com/ORNL/DataFed/releases).
The current entry covers changes since local `master` / `v5.1.3`; GitHub has no published `v5.1.3` release entry.
The pre-existing changelog entries below are preserved unchanged.

# v5.2.0

Release version: `2026.11.2.15.29`.

Each container image will also have the `v5.2.0` tag.

These notes describe the net changes between `master` (the same source tree as
`v5.1.3` at the time of review) and this release branch. Component versions remain
independent of the shared container image tag; Foxx and the Foxx API are `1.5.0`.

Published: 2026-04-06. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v5.2.0)

### Images
```
docker pull savannah.ornl.gov/datafed/core:v5.2.0
docker pull savannah.ornl.gov/datafed/web:v5.2.0
docker pull savannah.ornl.gov/datafed/foxx:v5.2.0
docker pull savannah.ornl.gov/datafed/gcs:v5.2.0
docker pull savannah.ornl.gov/datafed/repo:v5.2.0
```

## MAJOR - Breaking Changes

Changes that require user action and may break existing integrations.

1. [1199] - fix: foxx - Require an endpoint for Globus repository creation and reject overlapping repository paths on the same endpoint (#1942)

  Repository creation requests must supply a Globus endpoint. Repository paths
  on a shared endpoint must be distinct and must not be nested. Administrators
  should check existing repository configurations before changing paths or
  endpoints; updates validate the resulting configuration.

2. [1199] - fix: core, foxx, authz - Enforce repository service identity and endpoint boundaries during authorization (#1942)

  Repository credentials must authorize the originating repository. Requests
  are resolved only against repositories on the originating Globus endpoint.
  Deployments relying on mismatched credentials, cross-endpoint authorization,
  or local authorization bypasses must correct their configuration and access
  grants.

3. [1199] - fix: scripts, compose, gcs - Validate repository provisioning paths (#1942)

  Repository roots must be absolute and remain inside the collection base path.
  Configured repository paths must be canonical, relative paths without dot
  segments; symbolic-link roots and overlapping repository paths are rejected.
  Use `DATAFED_REPO_IDS_AND_DIRS` when specifying relative repository paths that
  contain directory separators.

## MINOR - Features & Enhancements

New functionality and improvements that maintain backward compatibility.

1. [1199] - feat: core, foxx, authz - Support multiple logical repositories served by one GridFTP endpoint and shared repository service credentials (#1942)

  Resolve repository ownership by the longest matching path prefix within the
  originating endpoint. Permit authorized traversal of ancestor directories
  so users can reach repositories below a shared collection root.

2. [1199] - feat: scripts, compose, gcs - Add multi-repository provisioning and deployment support (#1942)

  Generate repository configurations and Globus setup for multiple repositories
  per host, create per-repository user and project directories, and reuse
  existing gateway resources where supported. Single-repository configuration
  remains available.

## PATCH - Bug Fixes, Technical Debt & Improvements

Bug fixes, refactoring, documentation, and other improvements.

1. [1199] - fix: foxx - Tighten record sharing checks and prevent information disclosure for missing records (#1942)
2. [1199] - fix: foxx - Normalize repository paths and correct exported-path trailing slash handling (#1942)
3. [1199] - fix: authz - Normalize collection roots, enforce path component boundaries, and preserve a nonempty authorization path for the collection root (#1942)
4. [1199] - fix: authz - Improve authorization denial logging and random test-code initialization (#1942)
5. [1199] - fix: common - Replace the proxy timer's PUB/SUB control channel with acknowledged REQ/REP signaling and explicitly stop the capture thread (#1942)
6. [1199] - fix: common, core - Adapt descriptor string handling and JSON serialization options to updated Protobuf dependencies (#1942)
7. [1199] - fix: core - Use the storage result's `success` field when retrieving schema content (#1942)
8. [1199] - refactor: dependencies, web, ci - Consolidate dependency versions in the DataFedDependencies submodule and generate the web dependency manifest from shared inputs (#1942)
9. [1933] - upgrade: dependencies - Update the pinned DataFedDependencies revision (#1933)
10. [1934] - refactor: web - Remove unnecessary packages from the web container (#1935)
11. [1199] - refactor: docker, gcs - Harden container builds, reduce runtime contents, and align dependency and ArangoDB tooling versions (#1942)
12. [1939] - fix: web, foxx - Remove sensitive authentication tokens from web logs and remove the dummy Foxx password file value
13. [1199] - fix: ci - Initialize submodules in GitHub workflows and improve GitLab image checks, checkout, and end-to-end test setup (#1942)
14. [1199] - test: common, core, foxx, scripts - Add proxy shutdown, repository identity, authorization, multi-repository provisioning, and web manifest regression coverage (#1942)
15. [1199] - docs: compose, docker, admin - Document multi-repository deployment, dependency management, and container security (#1942)

## Contributors

Authors of the implementation commits introducing the net changes in this release:

Co-authored-by: Joshua S Brown <joshbro42867@yahoo.com>
Blake Nedved <blakeanedved@gmail.com>

Full Changelog: [v5.1.3...v5.2.0](https://github.com/ORNL/DataFed/compare/v5.1.3...v5.2.0)

# v5.1.2

Published: 2026-04-06. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v5.1.2)

### Summary
This release fixed the schema search capability that was resulting in empty schema definitions being returned to the web server.

### Images
```
docker pull savannah.ornl.gov/datafed/core:v5.1.2
docker pull savannah.ornl.gov/datafed/web:v5.1.2
docker pull savannah.ornl.gov/datafed/foxx:v5.1.2
docker pull savannah.ornl.gov/datafed/gcs:v5.1.2
docker pull savannah.ornl.gov/datafed/repo:v5.1.2
```

## PATCH - Bug Fixes, Technical Debt & Improvements
Bug fixes, refactoring, documentation, and other improvements

1. [1929] - fix: foxx schema search ids (#1930)

### Contributors
- Co-authored-by: Joshua S Brown [[brownjs@ornl.gov](mailto:brownjs@ornl.gov)](mailto:brownjs@ornl.gov)
- Co-authored-by: Blake Nedved [[nedvedba@ornl.gov](mailto:nedvedba@ornl.gov)](mailto:nedvedba@ornl.gov)

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v5.1.1...v5.1.2

# v5.1.1

Published: 2026-04-06. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v5.1.1)

### Summary
This release introduces a bug fix, for several schema functions that were not returning the schema id in a consistent manner, this was leading to broken storage behavior for linkml based schemas.

### Images
```
docker pull savannah.ornl.gov/datafed/core:v5.1.1
docker pull savannah.ornl.gov/datafed/web:v5.1.1
docker pull savannah.ornl.gov/datafed/foxx:v5.1.1
docker pull savannah.ornl.gov/datafed/gcs:v5.1.1
docker pull savannah.ornl.gov/datafed/repo:v5.1.1
```

## PATCH - Bug Fixes, Technical Debt & Improvements
Bug fixes, refactoring, documentation, and other improvements

1. [1925] - fix: make version number id consistent. (#1926)

### Contributors
- Co-authored-by: Joshua S Brown [[brownjs@ornl.gov](mailto:brownjs@ornl.gov)](mailto:brownjs@ornl.gov)

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v5.1.0...v5.1.1

# v5.1.0

Published: 2026-04-01. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v5.1.0)

### Summary
This release introduces multi-engine schema support (JSON Schema + LinkML), a schema factory abstraction for the core server, full schema CLI support in the Python client, and correlation ID propagation through database maintenance paths. Infrastructure improvements include core unit tests in CI, consolidated Foxx test database configuration, and removal of dead code.

### Images
```
docker pull savannah.ornl.gov/datafed/core:v5.1.0
docker pull savannah.ornl.gov/datafed/web:v5.1.0
docker pull savannah.ornl.gov/datafed/foxx:v5.1.0
docker pull savannah.ornl.gov/datafed/gcs:v5.1.0
docker pull savannah.ornl.gov/datafed/repo:v5.1.0
```

## MINOR - Features & Enhancements
New functionality and improvements that maintain backward compatibility

1. [1855] - feature: core - Add SchemaServiceFactory to decouple schema validation and storage logic (#1891)

- Introduces `ISchemaValidator`, `ISchemaStorage`, and `SchemaServiceFactory` abstractions
- `SchemaHandler` extracted from `ClientWorker` into dedicated handler class
- Supports pluggable schema engines: `json-schema` (ArangoDB-backed) and `linkml` (external SchemaDBApi)

2. [1912] - refactor: core - Register LinkML storage engine with schema handler (#1912)

3. [1902] - feature: core, common - Get schema API client into compliance with API spec file (#1903)

- `SchemaAPIClient` updated to match OpenAPI spec for external schema service communication

4. [1893] - feature: common - Proto3 add fields for schema type, format, and metadata format (#1894)

- `SchemaCreateRequest` gains `type` (field 6) and `format` (field 7)
- `SchemaData` gains `type` (field 13) and `format` (field 14)
- `MetadataValidateRequest` gains `format` (field 3)
- Additive proto3 changes; existing clients remain wire-compatible

5. [1896] - feature: foxx - Schema format and type added to schema create API (#1897)

- Schema create and revise endpoints accept `type` and `format` fields
- Schema ID responses now include version suffix (e.g. `"my_schema:0"` instead of `"my_schema"`)

6. [1830] - refactor: core, foxx - Refactored JSON schema integration (#1892, #1899, #1898)

- Foxx routers use dynamic `db_config.js` for graph/database name instead of hardcoded `"sdmsg"`
- New `db_env.js` provides shared environment configuration for arangosh scripts
- `JsonSchemaValidator` and `ExternalSchemaValidator` implement `ISchemaValidator` interface
- `ArangoSchemaStorage` and `ExternalSchemaStorage` implement `ISchemaStorage` interface

7. [1663] - feature: core - LogContext and correlation ID propagated to dbGetRaw, dbMaintenance, metricThread, and TaskWorker (#1885)

- `IAuthenticationManager` interface methods now accept `LogContext` parameter
- `DatabaseAPI::dbGetRaw` forwards `x-correlation-id` header to Foxx via curl
- `purgeTransferRecords` and `uidByPubKey` gain `LogContext` propagation

8. [1857] - feature: python_client - Schema CLI commands and CommandLib API support (#1859, #1895)

- New `schema` command group: `view`, `create`, `revise`, `update`, `search`, `delete`, `export`, `list`
- `CommandLib.API` gains corresponding methods: `schemaCreate`, `schemaRevise`, `schemaUpdate`, `schemaView`, `schemaSearch`, `schemaDelete`, `schemaExport`, `schemaList`
- Supports `--type` (`json-schema` | `linkml`) and `--format` (`json` | `yaml`) options
- Handles protobuf `def` reserved keyword via `setattr`/`getattr` workaround

9. [1919] - feature: python, web - Support LinkML schema type (#1921)

- Web UI schema dialogs support schema type selection and format-aware editing
- Python client passes schema type through create/revise workflows

10. [1906-1] - feature: ci - Add core unit testing to CI pipeline (#1907)

- New `run-core-unit-job` stage runs CTest from intermediate build image
- Filters out integration and fixture tests via `-LE "integration|fixture"`

## PATCH - Bug Fixes, Technical Debt & Improvements
Bug fixes, refactoring, documentation, and other improvements

1. [1914] - fix: web - Bug in schema ID name/version mismatch (#1915)

- Schema picker now strips version suffix before re-appending, preventing double-suffixed IDs

2. [1890] - fix: test - Mock core server build (#1890)

- Mock `AuthMap`, `AuthenticationManager`, `ClientWorker`, and `Condition` updated for `LogContext` interface changes
- Mock `PublicKeyTypes.hpp` aligned with core server types

3. [1913] - refactor: foxx - CI test scripts consolidate database name and default to separate database for tests (#1917)

- Test scripts read `DATAFED_DATABASE_NAME` from environment, defaulting to `sdms_test`
- New `DATAFED_ALLOW_TESTING_PROD_DATABASE` guard prevents accidental production database use in tests
- `ALLOW_PRODUCTION_DB` environment variable required to run against production database name

4. [1916] - tests: core - Add integration tests for schema client handler to CMake (#1918)

- Integration test suites for `SchemaHandlerJson`, `SchemaHandlerLinkML`, `SchemaAPIClient`, and `SchemaServiceFactory`
- CTest fixtures manage Docker containers (ArangoDB, Prism mock) for integration tests

5. [1887] - refactor: repo - Remove dead FUSE filesystem code (#1888)

- Deleted `repository/filesys/CMakeLists.txt` and `repository/filesys/fusemain.cpp`

6. [1910] - upgrade: web - Playwright 1.51.1 version (#1911)

7. [1830] - refactor: common - `TraceException::getErrorCode()` marked `const`

### Migration Notes

**Foxx schema ID format change**: Schema API responses now return composite IDs with version suffix (e.g. `"my_schema:0"` instead of `"my_schema"`). All internal consumers (core server, web UI, Python client) are updated in this release. External tools parsing Foxx schema responses directly will need to account for the new format.

**Test database safety**: Foxx test infrastructure now defaults to `sdms_test` database. CI pipelines targeting the production `sdms` database must set `ALLOW_PRODUCTION_DB=true` and `DATAFED_DATABASE_NAME=sdms`.

### Contributors
- Co-authored-by: Joshua S Brown [[brownjs@ornl.gov](mailto:brownjs@ornl.gov)](mailto:brownjs@ornl.gov)
- Co-authored-by: Blake Nedved [[blakeanedved@gmail.com](mailto:blakeanedved@gmail.com)](mailto:blakeanedved@gmail.com)
- Co-authored-by: Blake Nedved [[nedvedba@ornl.gov](mailto:nedvedba@ornl.gov)](mailto:nedvedba@ornl.gov)
- Co-authored-by: Austin Hampton [[amh107@latech.edu](mailto:amh107@latech.edu)](mailto:amh107@latech.edu)
- Co-authored-by: Polina Shpilker [[infinite.loopholes@gmail.com](mailto:infinite.loopholes@gmail.com)](mailto:infinite.loopholes@gmail.com)

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v5.0.0...v5.1.0

# v5.0.0

Published: 2026-03-02. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v5.0.0)

### Summary
This release delivers comprehensive logging improvements with correlation ID support, enhanced Globus integration, repository management enhancements, and critical security updates. The release includes significant infrastructure improvements, dependency updates, and numerous bug fixes that improve system reliability and user experience.

### Images
```
docker pull savannah.ornl.gov/datafed/core:v5.0.0
docker pull savannah.ornl.gov/datafed/web:v5.0.0
docker pull savannah.ornl.gov/datafed/foxx:v5.0.0
docker pull savannah.ornl.gov/datafed/gcs:v5.0.0
docker pull savannah.ornl.gov/datafed/repo:v5.0.0
```

## MAJOR - Breaking Changes
Changes that require user action and may break existing integrations

1. [1835] - refactor: common - Rework protobuf files following proto3 design principles, replace monolithic SDMS.proto/SDMS_Anon.proto/SDMS_Auth.proto with 186 individual proto3 message files and envelope-based message routing

Message type identification now derived at runtime from Envelope field descriptors instead of build-time file-order-dependent indices
Clients and tools linking against DataFed protobuf libraries must be rebuilt


2. [1837] - refactor: common - Update common library to use new proto3 envelope for serialization

All proto2 #include "common/SDMS.pb.h" / SDMS_Auth.pb.h replaced with #include "common/envelope.pb.h"
C++ error codes renamed (e.g. ID_SERVICE_ERROR → SERVICE_ERROR)


3. [1845] - refactor: repo - Repository server refactored to be compatible with proto3 envelope
4. [1848] - refactor: authz - Upgrade Authz module to use new proto3 envelope for serialization
5. [1847] - refactor: python_client - Python client updated to support proto3

Runtime reflection from Envelope replaces build-time pyproto_add_msg_idx.py tool


6. [1850] - refactor: web - Update web server to use proto3 files

Web service uses proto3 JSON camelCase field naming (e.g. api_major → apiMajor, release_year → releaseYear)
Version loading changed from async protobuf enum lookup to synchronous CMake-generated version.js import


7. [1825] - refactor: core, repo, authz, gcs - Upgrade crypto and openssl dependencies

Downstream components linking against DataFed crypto libraries may need compatibility updates


8. [1839] - refactor: ci - Split combined build/retag CI pipeline files into separate job files

Deleted: build_core_image.yml, build_foxx_image.yml, build_gcs_image.yml, build_repo_image.yml, build_ws_image.yml
Added: retag_core_image.yml, retag_foxx_image.yml, retag_gcs_base_image.yml, retag_gcs_image.yml, retag_repo_image.yml, retag_ws_image.yml
Downstream CI configurations referencing old pipeline files must be updated

## MINOR - Features & Enhancements
New functionality and improvements that maintain backward compatibility

1. [1774] - test: core, python_client, foxx, web - Add query end-to-end tests
2. [1786] - test: web - Add test for hitting password reset
3. [1522] - refactor: foxx - Comprehensive logging improvements across all routers

Authz Router (#1788)
Data Router (#1789)
Group Router (#1795)
Note Router (#1796)
Metrics Router (#1797)
Topic Router (#1801)
Config Router (#1813)
Admin Router (#1814)
ACL Router (#1817)
Collection Router (#1818)
Query Router (#1820)
Schema Router (#1821)
Proj Router (#1822)
Repo Router (#1823)
Router Logging Cleanup (#1838)

## PATCH - Bug Fixes, Technical Debt & Improvements
Bug fixes, refactoring, documentation, and other improvements

1. [1862] - fix: core - Fix record allocation change failure
2. [1872] - fix: core, web, foxx - Fix tests running until timeout, proto3 compatibility bugs, log bugs, removed proj search
3. [1824] - fix: gcs, web - Fix mapped collection consent flow
4. [1839] - fix: ci - CI image retag triggered where a build is needed
5. [1833] - fix: ci - End to end tests failing in CI
6. [1805] - refactor: foxx - Refactor user tokens expiring route
7. [1808] - fix: foxx - User router logging fix
8. [1803] - refactor: foxx - Fix user update logs leaking sensitive information
9. [1777] - fix: foxx - Fix user_router regression in missing response
10. [1775] - fix: core, foxx - Add missing {}, foxx query_router add params object schema to routes
11. [1277] - fix: common, core - PROXY_BASIC_ZMQ and PROXY_CUSTOM correctly defined
12. [1790] - fix: common, core, repo - Fix zmq assertion failure during EXCEPT call due to calling zmq_msg with invalid state after closing it
13. [1791] - fix: python_client - Fix requirements.txt being moved to a folder named requirements.txt during cmake configure script
14. [1861] - fix: web - Prevent defaults being set to undefined, and interpret numbers and enums as strings
15. [1868] - fix: web - Version numbers from proto3 messages follow camelCase
16. [1877] - fix: web - Fix user router /update

### Contributors
Co-authored-by: Joshua S Brown [joshbro42867@yahoo.com](mailto:joshbro42867@yahoo.com)
Co-authored-by: Blake Nedved [nedvedba@ornl.gov](mailto:nedvedba@ornl.gov)
Co-authored-by: Blake Nedved [blakeanedved@gmail.com](mailto:blakeanedved@gmail.com)
Co-authored-by: nedvedba [145805866+nedvedba@users.noreply.github.com](mailto:145805866+nedvedba@users.noreply.github.com)
Co-authored-by: Austin Hampton [amh107@latech.edu](mailto:amh107@latech.edu)
Co-authored-by: Austin Hampton [44103380+megatnt1122@users.noreply.github.com](mailto:44103380+megatnt1122@users.noreply.github.com)

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v4.0.0...v5.0.0

# v4.0.0

Published: 2025-12-09. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v4.0.0)

### Summary
This release delivers comprehensive logging improvements with correlation ID support, enhanced Globus integration, repository management enhancements, and critical security updates. The release includes significant infrastructure improvements, dependency updates, and numerous bug fixes that improve system reliability and user experience.

### Images

Images can be pulled using the overal application version number
```
docker pull savannah.ornl.gov/datafed/core:v4.0.0
docker pull savannah.ornl.gov/datafed/web:v4.0.0
docker pull savannah.ornl.gov/datafed/foxx:v4.0.0
docker pull savannah.ornl.gov/datafed/gcs:v4.0.0
docker pull savannah.ornl.gov/datafed/repo:v4.0.0
```

They can be pulled with overal application version number and component version.
```
docker pull savannah.ornl.gov/datafed/core:v4.0.0-2.0.0
docker pull savannah.ornl.gov/datafed/foxx:v4.0.0-1.2.0
docker pull savannah.ornl.gov/datafed/gcs:v4.0.0-2.0.0
docker pull savannah.ornl.gov/datafed/repo:v4.0.0-2.0.0
docker pull savannah.ornl.gov/datafed/web:v4.0.0-2.0.0
```

They can be pulled by date of release.
```
docker pull savannah.ornl.gov/datafed/core:v2025.12.09.10.00
docker pull savannah.ornl.gov/datafed/web:v2025.12.09.10.00
docker pull savannah.ornl.gov/datafed/foxx:v2025.12.09.10.00
docker pull savannah.ornl.gov/datafed/gcs:v2025.12.09.10.00
docker pull savannah.ornl.gov/datafed/repo:v2025.12.09.10.00
```

They can be pulled by commit sha.
```
docker pull savannah.ornl.gov/datafed/core:7b76aa37a95b46b0501d09e090e9fa316743bf55
docker pull savannah.ornl.gov/datafed/web:7b76aa37a95b46b0501d09e090e9fa316743bf55
docker pull savannah.ornl.gov/datafed/foxx:7b76aa37a95b46b0501d09e090e9fa316743bf55
docker pull savannah.ornl.gov/datafed/gcs:7b76aa37a95b46b0501d09e090e9fa316743bf55
docker pull savannah.ornl.gov/datafed/repo:7b76aa37a95b46b0501d09e090e9fa316743bf55
```

## MAJOR - Breaking Changes
Changes that require user action and may break existing integrations

1. [1689] - DAPS-1688  refactor: core/repo/authz/gcs - Migrate from OpenSSL 1.x to OpenSSL 3 - Applications linking against DataFed libraries may need compatibility updates
2. [1726] - DAPS-1725  refactor: tests - Relocate mock core service from repository/gridftp/globus5/authz/mock_core/ to tests/mock_core/ - Tools referencing old location must be updated
3. [1660] - DAPS-1659  refactor: scripts - Remove dependency install scripts and externalize to Git submodule external/DataFedDependencies - All dependency script paths must be updated
* refactor: build - Require Git submodule initialization - Build process now requires git submodule update --init --recursive


## MINOR - Features & Enhancements
New functionality and improvements that maintain backward compatibility

1. [1704] - DAPS-1663  feature: core - Add Correlation ID to Core Service logging for improved request tracing
2. [1758] - DAPS-1522  feature: foxx - Add comprehensive logging improvements to Version Router
3. [1734] - DAPS-1522  feature: foxx - Add comprehensive logging improvements to Tag Router
4. [1627] - DAPS-1522  feature: foxx - Add comprehensive logging improvements to Query Router
5. [1648] - DAPS-1522  feature: foxx - Add comprehensive logging improvements to Task Router
6. [1629] - DAPS-1522  feature: foxx - User router logging improvements, remove non-helpful logs from tasks.js
7. [1675] - DAPS-1675  feature: foxx - Add logger functions for improved debugging
8. [1731] - DAPS-1731  feature: scripts/compose - Add scripts to generate Globus credentials for web service
9. [1741] - DAPS-1741  feature: scripts - Update native client ID in initialize_globus_endpoint and globus_clean scripts
10. [1697] - DAPS-1676  feature: foxx/arango - Add factory pattern for repositories supporting metadata and Globus
11. [1706] - DAPS-1705  feature: foxx - Integrate metadata globus factory in repo router create
12. [1712] - DAPS-1711  feature: foxx - Standardize repo response schema
13. [1714] - DAPS-1713  feature: core/web/python - Make fields optional when creating repo to support metadata repositories
14. [1716] - DAPS-1715  feature: core - Make path, pub_key, address, endpoint optional in RepoCreateRequest
15. [1719] - DAPS-1718  feature: protobuf - Add ExecutionMethod enum and RepoAllocationCreateResponse
16. [1670] - DAPS-1670  feature: common/core/repo/python/web - Allow passing repo types in protobuf messages
17. [1672] - DAPS-1671  feature: foxx - Add repository and execution strategy types
18. [1687] - DAPS-1685  feature: compose - Enable ArangoDB SSL/TLS support in Docker Compose deployment
19. [1646] - DAPS-1585  update: dependencies - Upgrade SSL dependency to version 3.2.5
20. [1709] - DAPS-1707  feature: web - Update web dependencies before installation
* feature: ci - Add base-image-check stage to GitLab CI pipeline
* feature: ci - Enable recursive submodule strategy with GIT_SUBMODULE_STRATEGY: recursive
* feature: cmake - Add DENABLE_INTEGRATION_TESTS flag for conditional test building

## PATCH - Bug Fixes, Technical Debt & Improvements
Bug fixes, refactoring, documentation, and other improvements

1. [1753] - DAPS-1378  fix: web - Fix mapping of multiple Globus accounts to DataFed users
2. [1778] - DAPS-1777  Foxx, fix: user_router fix regression in missing response.
3. [1779] - DAPS-1774  Core, Python, Database, Foxx, Test add query end to end tests
* DAPS-1766 fix: ci - Fix Python client provisioning job failures

4. [1736] - DAPS-1735  fix: foxx - Remove duplicate user_router test
5. [1747] - DAPS-1725-2  fix: tests - Fix centralized mock core service libraries (part 2)
6. [1693] - DAPS-1692  fix: ci - Fix flaky end-to-end web test reliability
7. [1732] - DAPS-1729  fix: ci - Fix downstream DataFed dependencies pipelines building from incorrect SHA
8. [1757] - DAPS-1756  fix: scripts/foxx - Add retries and connection checks to install_foxx.sh script
9. [1623] - DAPS-1605  fix: scripts - Fix install_foxx.sh by splitting ssl_args
10. [1689] - DAPS-1688  refactor: dependencies - Pin Globus SDK version for stability
11. [1765] - DAPS-1737  refactor: compose - Clean up ArangoDB SSL environment variables
12. [1750] - DAPS-1749  refactor: cmake - Set CMake policy to silence noisy warnings
13. [1701] - DAPS-1700  refactor: ci - Limit ArangoDB job output to last 3 hours
14. [1744] - DAPS-1742  refactor: scripts - Replace os.path.join with urllib.parse.urljoin for proper URL handling
15. [1746] - DAPS-1745  refactor: scripts - Update scripts to account for nested client credentials
16. [1695] - DAPS-1694  refactor: foxx - Move permissions functions from support.js to lib/permissions
17. [1691] - DAPS-1691  refactor: foxx - Remove circular dependency from validation.js
18. [1728] - DAPS-1725  refactor: config - Remove confusing Apache configuration file
19. [1656] - DAPS-1651 [#1656/#1658]() refactor: scripts/compose - Unify treatment of environment variables in compose env generator
20. [1661] - DAPS-1661  refactor: compose/scripts - Remove remaining occurrences of ZeroMQ system secret
* refactor: build - Standardize YAML indentation across all configuration files
* refactor: gitignore - Add patterns for *.tar.gz, *.tgz, and tests/mock_core/Version.hpp
* refactor: docker - Improve Dockerfile layer caching and dependency management
* refactor: ci - Implement job output limiting for long-running job
* refactor: only print subset of user properties.

### Contributors
Joshua S Brown <joshbro42867@yahoo.com>
JoshuaSBrown <brownjs@ornl.gov>
Blake Nedved <nedvedba@ornl.gov>
Austin Hampton <amh107@latech.edu>
Blake Nedved <blakeanedved@gmail.com>
Polina Shpilker <infinite.loopholes@gmail.com>

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v3.14.01...v4.0.0

# v3.14.01

Published: 2025-10-06. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v3.14.01)

### What's Changed

1. [1625] - user id map for session key by @JoshuaSBrown, @AronPerez in https://github.com/ORNL/DataFed/pull/1647

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v3.14.0...v3.14.01

# v3.14.0

Published: 2025-09-04. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v3.14.0)

#### Merged

1. [1329] - Individual docker scripts
2. [1621] - bug: Fixed permission handling within dockerfile.foxx
3. [1620] - [TASK] Update JS and Shell CI's to Format and Commit
4. [1617] - fix: make secret optional before removing completely.
5. [1605] - feature openshift support foxx [`#1606`](https://github.com/ORNL/DataFed/pull/1606)
6. [1613] - Formatting remaining scripts within DataFed
7. [1589] - style:Formatted dependency scripts
8. [1568] - Formatting install scripts [`#1592`](https://github.com/ORNL/DataFed/pull/1592)
9. [1568] - Formatted uninstall and util scripts [`#1594`](https://github.com/ORNL/DataFed/pull/1594)
10. [1522] - Arango Removing Unneccessary Logs [`#1601`](https://github.com/ORNL/DataFed/pull/1601)
11. [1531] - refactor useless secret user router part 3 [`#1611`](https://github.com/ORNL/DataFed/pull/1611)
12. [1588] - style: Formatted containter scripts
13. [1581] - style:properly formatted admin_send_email_notification.sh
14. [1582] - style: Formatted admin_toggle_user_acccount.sh
15. [1586] - style: Formatted compose scripts
16. [1568] - Formatted run scripts [`#1593`](https://github.com/ORNL/DataFed/pull/1593)
17. [1568] - Formatted globus scripts [`#1595`](https://github.com/ORNL/DataFed/pull/1595)
18. [1590] - style: Formatted export_dependency_version
19. [1607] - [TASK] Update script for GCS
20. [1572] - Centralize timeout values using env variable within end-to-end testing [`#1598`](https://github.com/ORNL/DataFed/pull/1598)
21. [1568] - Formatted generate scripts [`#1591`](https://github.com/ORNL/DataFed/pull/1591)
22. [1597] - refactor: remove system secret from http params.
23. [1583] - style: Formatted admin_update_config_message.sh
24. [1600] - 1596 daps feat support core service openshift
25. [1587] - style: Formatted clear_db.sh
26. [1571] - style:formatted the admin_get_user_emails.sh with shtmf
27. [1584] - style: Formatted ci scripts
28. [1577] - refactor: remove useless secret from user_router.
29. [1574] - fix: memory bug fixed in Condition.hpp and AuthenticationManager
30. [1551] - ci job fail correctly on failed curl [`#1556`](https://github.com/ORNL/DataFed/pull/1556)
31. [1550] - fix:Fixed the double free issue within the GlobusAPI constructor and move operator
32. [1569] - [TASK] Format yaml
33. [1554] - refactor - fix exception messages in resetKey, setAccessCount, getAccessCount in AuthMap
34. [1552] - fix: promotion logic in promotion core service condition
35. [1529] - Rework generate env script [`#1545`](https://github.com/ORNL/DataFed/pull/1545)
36. [1548] - fix: Added appropriate move to AuthenticationManager
37. [1526] - Austin remove dead code
38. [1535] - fix: add unauthorized error check in ci infrastructure job check.
39. [1528] - fix: make protobuf file generation and compile order explicit to prevent race condition.
40. [1521] - fix:Changed the base image from focal:ubuntu to debian:bookworm-slim
41. [1336] - Security updates to containers
42. [1511] - feat(yaml formatter): added yaml formatter check action file.
43. [1509] - freature(github action): Add shell-formatter check
44. [1507] - Dependency_install_functions.sh
45. [1506] - formatting(foxx) ran prettier fix
46. [1486] - [Release] v3.13.01 Resolve Devel Branch Diff
47. [1331] - Collection ID Updated on restart [`#1468`](https://github.com/ORNL/DataFed/pull/1468)

# v3.13.01

Published: 2025-06-09. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v3.13.01)

## MAJOR Breaking changes

## MINOR Feature

1. [1392] - [DAPS-1388] Add GCP Support
2. [1400] - Set reasonable default that will help with filling in repo form for core t…
3. [1427] - Improve serialization randomization
4. [1419] - [`#1431`]() [DAPS-1408] Provenance Visual Management Lint (2/2)
5. [1447] - 1445 docker logs multiple containers
6. [1446] - Allow looping over containers if there is more than one.
7. [1468] - [DAPS-1331] Collection ID Updated on restart

## PATCH Bug fixes/Technical Debt/Documentation

1. [1335] - Add .venv/ to gitignore
2. [1404] - Add missing python module
3. [1393] - Add documentation describing how to test the foxx microservices unit …
4. [1390] - Fix ci build
5. [1426] - Fix docker logs output in end-to-end tests
6. [1428] - Fix regression
7. [1440] - Upgrade formatter
8. [1438] - 1437 fix zmq inproc bind order
9. [1444] - Fix conflicting dependency install flags
10. [1424] - [DAPS-1395] Address Memory Leaks in Core Server
11. [1454] - [TASK] Update tests and fixture
12. [1489] - [TASK] Remove icons from labels in Provenance Visuals

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v2025.3.31.15.03...v3.13.01-rc.4

# v2025.3.31.15.03

Published: 2025-04-07. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v2025.3.31.15.03)

## MAJOR Breaking changes

## MINOR Feature

## PATCH Bug fixes/Technical Debt/Documentation

1. [1350] - (https://github.com/ORNL/DataFed/pull/1350) - Provenance Capture Update Bug

# v2025.3.31.15.01

Published: 2025-04-07. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v2025.3.31.15.01)

### DataFed-v2025.3.31.15.01

This is to capture the changes during release that were added. We are now going to standardize versions as follows

-patch
-hotfix
every 3 months
`.1 → .2 → .3`
```text
v2025.3.12.15.01 →v2025.3.31.15.02
         ^ ^ ^
        / / /
          12 -> major
          15 -> minor
          01 -> patch
```

## MAJOR Breaking changes

1. [1326] - Merge hotfixes into devel by @t-ramz in
2. [1328] - JSON parse error fix by @t-ramz in

## MINOR Feature

1. [1284] - Feature DAPS 1215 foxx UserGetAccessTokenRequest mapped collection support by @t-ramz in
2. [1341] - Add small fix for storeCollectionId by @t-ramz in
3. [1330] - Address Download Extension Transfer by @AronPerez in https://github.com/ORNL/DataFed/pull/1340
4. [1334] - Feature - Mapped Collection Token Support by @t-ramz in
5. [1242] - [DLT-1110] Implement Consent Required Action (3/4 & 4/4) by @AronPerez in

## PATCH Bug fixes/Technical Debt/Documentation

1. [1301] - Release february 2025 by @JoshuaSBrown in
2. [1343] - Fix bug with playwright by @JoshuaSBrown in
3. [1347] - Parse md json strings by @t-ramz in

**Full Changelog**: https://github.com/ORNL/DataFed/compare/v2025.2.12.14.00...v2025.3.31.15.01

# v2025.3.12.15.01

Published: 2025-03-12. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v2025.3.12.15.01)

### Pre-release
## MAJOR Breaking changes
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

# v2025.2.16.21.15

Published: 2025-02-17. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v2025.2.16.21.15)

## PATCH Bug fixes/Technical Debt/Documentation

1. [1322] - Fix configuration setting for allowing a custom number of threads.

# v2025.2.12.14.03

Published: 2025-02-12. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v2025.2.12.14.03)

## MAJOR Breaking changes
## MINOR Feature

1. [1240] - [DLT-1110] Mapped Collection Endpoint Browse (1/4)
2. [1231] - Revert "[DLT-1110] Mapped Collection Endpoint Browse (1/4)"
3. [1228] - Feature DLT 1120 retrieve transfer token
4. [1224] - [DAPS, Foxx] - 1180 refactor Part 2 authz
5. [1218] - 1216 daps feature add improved ci scanning
6. [1217] - Feature DLT 1127 relay new token data
7. [1210] - 1209 feature add jsdoc linter
8. [1196] - Add support for authz lookup
9. [1194] - Feature DLT 1109 foxx new token data
10. [1192] - Add DataFed dependency paths to curl so SSL will be found
11. [1160] - 1106 updated proto messages for setting token
12. [1141] - DLT 1119 Provide method for Globus Authorize URL
## PATCH Bug fixes/Technical Debt/Documentation

1. [1298] - Fix bug in CI scripts associated with repo and gcs image build
2. [1239] - Applied fix to deprecation warning
3. [1289] - Add github action for linting jupyter
4. [1286] - Update the schema documentation to improve the usability.
5. [1291] - Update python notebooks
6. [1270] - Add env var
7. [1271] - Update Arangodb packaged version to using 3.12.4
8. [1274] - Fix confusion in key uses in end to end tests
9. [1260] - 1255 feature mock core server initial integration testing authz
10. [1262] - Address JSDoc complaints
11. [1258] - Fix edge case in GridFTP Authz where '/' is used
12. [1251] - Bug daps 1243 datafed web logging
13. [1238] - Throw error if OpenStack error code returned from API
14. [1234] - Fix bug on task_router.js abort function
15. [1227] - Update nlhoman json version
16. [1221] - 1219 daps bug gitlab ci gcs log
17. [1212] - 1211 fix jsdoc errors
18. [1206] - 1205 refactor formatting across javascript
19. [1201] - 1200 feature GitHub action javascript linter formatter
20. [1197] - Refactor foxx unit tests so they will run correctly
21. [1203] - Address eslint errors
22. [1188] - Remove --dump flag
23. [1187] - 1184 bug add set e foxx install
24. [1186] - Changes to allow for and auto generate debug log level
25. [1181] - 1180 refactor foxx authz
26. [1175] - Add -e back to core/database/test/scripts
27. [1169] - 1168 feature add authz unit tests to ci
28. [1167] - Add missing comment on env variable
29. [1161] - 1159 refactor authz cpp file
30. [1158] - 1154 feature add unit test authz
31. [1157] - Add scripts for locating globus and gss api libraries
32. [1134] - 1114 add web unit testing to ci
33. [1163] - Remove line split
34. [1153] - Upgrade dependency of curl to 8.11
35. [1151] - Throw error if variable is not defined properly
36. [1148] - Provide default results for calls to gcs that allow proper evaluation later.
37. [1131] - 1130 bug entrypoint error ignoring errors
38. [1139] - 1128 Fix GCS Container json permission issues
39. [1136] - Fix parallel runs, by adding random sleep
40. [1133] - Add check for running container
41. [1129] - 1121 fix undefined build var in dockerfile
42. [1125] - Remove overwrite of PATH
43. [1072] - 1071 add unit testing to web
44. [1112] - Removed --no-cache flag
45. [1108] - Update web version, with path due to change from CommonJS to ESM
46. [1079] - 1077 refactor support esm deprecate commonjs syntax
47. [1068] - 1065 fix ci cleanup script
48. [1064] - 1056 foxx test script fix
49. [1104] - Fix parallel builds of retag and container build
50. [1092] - Cleanup echo statements and make image tags explicit
51. [1094] - make harbor script more robust to error response returned by api
52. [1101] - Fix formatting of MessageLib and VersionUtils
53. [1098] - Switch from using latest to CI_COMMIT_SHA
54. [1089] - 1086 bug python client pypi version
55. [1062] - 1055 fix foxx setup script
56. [1096] - 1057 trigger running foxx tests as part of ci
57. [1059] - 1057 trigger running foxx tests as part of ci
58. [1088] - Add documentation about running DataFed Python package from source repo
59. [1081] - Simplify cmake command
60. [1078] - move flag to the correct position after ps
61. [1076] - grab log output even if container fails
62. [1074] - 1073 add missing deployment key to node setup job
63. [1061] - Add log output from ci end-to-end arango-setup job
64. [1054] - 1053 enable foxx tests in ci pipeline

# v2025.2.12.14.00

Published: 2025-02-12. [GitHub release](https://github.com/ORNL/DataFed/releases/tag/v2025.2.12.14.00)

## MAJOR Breaking changes

## MINOR Feature

1. [1240] - [DLT-1110] Mapped Collection Endpoint Browse (1/4)
2. [1231] - Revert "[DLT-1110] Mapped Collection Endpoint Browse (1/4)"
3. [1228] - Feature DLT 1120 retrieve transfer token
4. [1224] - [DAPS, Foxx] - 1180 refactor Part 2 authz
5. [1218] - 1216 daps feature add improved ci scanning
6. [1217] - Feature DLT 1127 relay new token data
7. [1210] - 1209 feature add jsdoc linter
8. [1196] - Add support for authz lookup
9. [1194] - Feature DLT 1109 foxx new token data
10. [1192] - Add DataFed dependency paths to curl so SSL will be found
11. [1160] - 1106 updated proto messages for setting token
12. [1141] - DLT 1119 Provide method for Globus Authorize URL

## PATCH Bug fixes/Technical Debt/Documentation

1. [1298] - Fix bug in CI scripts associated with repo and gcs image build
2. [1239] - Applied fix to deprecation warning
3. [1289] - Add github action for linting jupyter
4. [1286] - Update the schema documentation to improve the usability.
5. [1291] - Update python notebooks
6. [1270] - Add env var
7. [1271] - Update Arangodb packaged version to using 3.12.4
8. [1274] - Fix confusion in key uses in end to end tests
9. [1260] - 1255 feature mock core server initial integration testing authz
10. [1262] - Address JSDoc complaints
11. [1258] - Fix edge case in GridFTP Authz where '/' is used
12. [1251] - Bug daps 1243 datafed web logging
13. [1238] - Throw error if OpenStack error code returned from API
14. [1234] - Fix bug on task_router.js abort function
15. [1227] - Update nlhoman json version
16. [1221] - 1219 daps bug gitlab ci gcs log
17. [1212] - 1211 fix jsdoc errors
18. [1206] - 1205 refactor formatting across javascript
19. [1201] - 1200 feature GitHub action javascript linter formatter
20. [1197] - Refactor foxx unit tests so they will run correctly
21. [1203] - Address eslint errors
22. [1188] - Remove --dump flag
23. [1187] - 1184 bug add set e foxx install
24. [1186] - Changes to allow for and auto generate debug log level
25. [1181] - 1180 refactor foxx authz
26. [1175] - Add -e back to core/database/test/scripts
27. [1169] - 1168 feature add authz unit tests to ci
28. [1167] - Add missing comment on env variable
29. [1161] - 1159 refactor authz cpp file
30. [1158] - 1154 feature add unit test authz
31. [1157] - Add scripts for locating globus and gss api libraries
32. [1134] - 1114 add web unit testing to ci
33. [1163] - Remove line split
34. [1153] - Upgrade dependency of curl to 8.11
35. [1151] - Throw error if variable is not defined properly
36. [1148] - Provide default results for calls to gcs that allow proper evaluation later.
37. [1131] - 1130 bug entrypoint error ignoring errors
38. [1139] - 1128 Fix GCS Container json permission issues
39. [1136] - Fix parallel runs, by adding random sleep
40. [1133] - Add check for running container
41. [1129] - 1121 fix undefined build var in dockerfile
42. [1125] - Remove overwrite of PATH
43. [1072] - 1071 add unit testing to web
44. [1112] - Removed --no-cache flag
45. [1108] - Update web version, with path due to change from CommonJS to ESM
46. [1079] - 1077 refactor support esm deprecate commonjs syntax
47. [1068] - 1065 fix ci cleanup script
48. [1064] - 1056 foxx test script fix
49. [1104] - Fix parallel builds of retag and container build
50. [1092] - Cleanup echo statements and make image tags explicit
51. [1094] - make harbor script more robust to error response returned by api
52. [1101] - Fix formatting of MessageLib and VersionUtils
53. [1098] - Switch from using latest to CI_COMMIT_SHA
54. [1089] - 1086 bug python client pypi version
55. [1062] - 1055 fix foxx setup script
56. [1096] - 1057 trigger running foxx tests as part of ci
57. [1059] - 1057 trigger running foxx tests as part of ci
58. [1088] - Add documentation about running DataFed Python package from source repo
59. [1081] - Simplify cmake command
60. [1078] - move flag to the correct position after ps
61. [1076] - grab log output even if container fails
62. [1074] - 1073 add missing deployment key to node setup job
63. [1061] - Add log output from ci end-to-end arango-setup job
64. [1054] - 1053 enable foxx tests in ci pipeline

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
