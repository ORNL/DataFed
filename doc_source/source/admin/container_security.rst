Container vulnerability remediation
==================================

The runtime, GCS, web, and Foxx Dockerfiles apply available distribution updates
using the configured package repositories. APT index download failures fail the
build instead of silently using an incomplete index. Rebuild the shared runtime
before its dependent core, repository, web, and Foxx images. Use ``--pull`` and
``--no-cache`` when refreshing security packages: cached Docker layers do not
re-run package updates. Rebuild the dependency and GCS base images as well when
those images supply affected components. No CI configuration changes are required
by these Dockerfile changes.

The GCS final stage no longer installs ``build-essential`` or
``libsqlite3-dev``. Authz is compiled in the builder stage. Foxx now uses the
shared runtime and copies its deployment tools instead of inheriting the full
dependency image. Its CMake configuration does not require a C/C++ compiler when
only Foxx is enabled. The deployment CLI is installed during the image build;
container startup does not need to download npm packages.

Web and Foxx omit Node's bundled npm dependency tree from the final image.
Web retains production modules and prunes development modules in the final stage;
the web builder retains its unit-test tools. Both web manifests use dependency
sections from ``DataFedDependencies/web/package.json``, including security
overrides and the ZeroMQ compatibility adapter. The application manifest is
generated with DataFed's own metadata and resolved again during its build.
Overrides keep
brace-expansion, ip-address, postcss-selector-parser, undici 6, and
http-cache-semantics within their existing major release families.

Findings that require separate assessment
-----------------------------------------

These changes do **not** establish that every reported CVE has been fixed.
Scan the rebuilt final image digest with a current vulnerability database. Keep
OS package findings separate from pip/npm copies and bundled libraries: updating
an APT package does not patch an independent Python environment or a static binary.

* ``CVE-2023-45853`` concerns MiniZip. Debian states that the affected MiniZip
  code is not built into the reported Bookworm zlib binary packages. Verify that
  a vulnerable MiniZip copy is absent before classifying this particular finding
  as not affected. This is not a blanket zlib exception.
  `Debian assessment <https://security-tracker.debian.org/tracker/CVE-2023-45853>`_.
* ``CVE-2025-7458`` remains unfixed in Debian 12 SQLite
  ``3.40.1-2+deb12u2``. Removing its development headers does not fix the runtime
  library. GCS depends on SQLite, so removing the runtime would break GCS.
  A vendor-supported fixed package or a separately validated base OS upgrade is
  still required.
  `Debian assessment <https://security-tracker.debian.org/tracker/CVE-2025-7458>`_.
* ``CVE-2023-2953`` (LDAP), ``CVE-2025-69720`` (ncurses), and
  ``CVE-2026-53613`` (util-linux) also remain listed as affected on Bookworm.
  Other reported curl, systemd, gzip, util-linux, PAM, XML, LMDB, media-library,
  and libsoup findings must be reconciled against the rebuilt image inventory;
  a package refresh alone is not evidence that they are resolved. Do not mix
  Debian unstable packages into these images or remove GCS runtime dependencies
  to obtain a cleaner scan.
  `LDAP <https://security-tracker.debian.org/tracker/CVE-2023-2953>`_,
  `ncurses <https://security-tracker.debian.org/tracker/CVE-2025-69720>`_,
  `util-linux <https://security-tracker.debian.org/tracker/CVE-2026-53613>`_.
* Debian backported the setuptools fixes while retaining upstream version
  ``66.1.1``. The full Debian revision matters:
  ``66.1.1-1+deb12u2`` fixes ``CVE-2025-47273``. Independently installed pip
  copies need their own version checks. ``urllib3`` needs version ``2.8.0`` for
  ``CVE-2026-97687``; check the Python interpreter actually used by the service.
  `setuptools <https://security-tracker.debian.org/tracker/CVE-2025-47273>`_,
  `urllib3 <https://security-tracker.debian.org/tracker/CVE-2026-97687>`_.
* The http-cache-semantics ``CVE-2026-93748`` report is disputed by its maintainer.
  The manifests require the available ``4.3`` release family; a newer version
  number alone is not proof that the reported behavior was changed.
  `Maintainer response <https://github.com/kornelski/http-cache-semantics/issues/56>`_.

Verification
------------

Provisioning and web-manifest regression tests are available to run locally.
Live end-to-end setup configures all repository paths from one list in both
services. The client repository test registers every generated form and waits for successful
allocation creation/deletion tasks on every repository before removing them.

Define one GitLab CI/CD variable for the shared-service end-to-end jobs:

.. code-block:: bash

   CI_DATAFED_REPO_IDS_AND_DIRS=path1/bam,path2/bambar,path3/path5/images

Each final directory name is its repository ID; IDs must be unique valid keys.
Paths are relative to ``DATAFED_GCS_COLLECTION_ROOT_PATH``; these CI jobs use
``/mnt/datafed``, giving ``/mnt/datafed/path1/bam``,
``/mnt/datafed/path2/bambar``, and ``/mnt/datafed/path3/path5/images``. Both
services receive the same list. CI loops over all entries to clean stale forms,
wait for startup, collect ``repo-forms/`` artifacts, and test shared-service
allocations. No separate primary or secondary CI ID variable is required.

The first entry supplies the shared callout's existing authorization identity
(``bam`` in this example). CI registers it first and removes it last. Keep the
first entry stable across the setup jobs; authorization still resolves each
request against the owning repository's registered path and permissions. The
other API test suites use the first form as their single-repository fixture.

The GCS unit job invokes CTest directly, so its runtime does not need ``make`` or
compilers. Foxx deployment and test scripts reuse the preinstalled Node and CLI
without loading privileged installation helpers.

If an existing guest collection has no local base-path cache, provisioning asks
the authenticated GCS API for collection details. Reuse requires the expected
guest ID, provisioning client as owner, mapped collection ID, and an exposed absolute ``collection_base_path``
matching configuration. Missing private fields, access failures, changed paths,
or mismatched identities still stop startup without deleting the collection.
Restore a verified cache or correct the provisioning client's access in those
cases; do not populate the cache by guessing from the requested environment path.
`GCS collection API <https://docs.globus.org/globus-connect-server/v5/api/openapi/>`_.

Repository provisioning regression tests do not require a Globus account:

.. code-block:: bash

   python3 -m unittest discover -s tests -p 'test_*repo*.py'

They check matching mounts in both Compose files, arbitrary repository counts,
legacy migration, host directory preparation, gateway policy reconciliation on
restart/removal, registration forms, and rejection of invalid or ambiguous
configuration. The core repository service identity unit test separately checks
that shared credentials cannot authorize a different service or collection.

An authenticated end-to-end transfer is still required for deployment acceptance.
Register every generated repository form, allocate storage on each repository,
and upload/download through both ``bam`` and ``bambar``. Confirm that a user
without an allocation on the other repository is denied access. Repeat after
recreating the repo and GCS containers. Keep the existing guest collection base
unchanged when adding repositories, and do not enable collection recreation just
to bypass a base-path validation failure.
