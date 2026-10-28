Web package manifests
=====================

``external/DataFedDependencies/web/package.json`` owns web dependency versions,
development dependencies, and security overrides. The dependency image installs
that manifest directly. Edit it in the dependency repository when changing web
packages, then commit the dependency change and update DataFed's submodule
reference.

``web/package.json.in`` contains application metadata and scripts. CMake expands
the application version and invokes ``scripts/generate_web_package.cjs`` with
that metadata and the dependency manifest to produce ``web/package.json``.
Dependency declarations in the metadata template are rejected. The generated
manifest is gitignored and should not be edited. Changes to either input trigger
CMake regeneration on the next build.

Node is required for generation. A configured build uses the Node installation
from the dependency prefix when available; standalone ``cmake -P cmake/Web.cmake``
can use Node from PATH. Set ``DATAFED_WEB_NODE_EXECUTABLE`` explicitly if needed.

The relative ``file:./zeromq-compat`` dependency requires its adapter directory
beside the manifest. CMake copies it into the web source directory; the web
installer also copies it into the installation directory before invoking npm.
The web builder retains development dependencies for unit tests, and the final
runtime stage prunes them.

Manifest generation and installation checks can be run without npm downloads:

.. code-block:: bash

   node --test tests/test_web_package.cjs

The CMake integration checks use ``DATAFED_TEST_CMAKE`` when provided, otherwise
the standard DataFed or system CMake location.
