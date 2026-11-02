cmake_minimum_required (VERSION 3.17.0)

# DataFed Version numbers need to be defined before running configure scripts
include (${CMAKE_CURRENT_LIST_DIR}/Version.cmake)

# Prepare web files
# Keep the local adapter available to npm when resolving the same dependency
# manifest used by the dependency image.
file(COPY "${CMAKE_CURRENT_LIST_DIR}/../external/DataFedDependencies/web/zeromq-compat"
     DESTINATION "${CMAKE_CURRENT_LIST_DIR}/../web")
# This script can be run as part of the cmake include process or as it's own
# script
configure_file(
  "${CMAKE_CURRENT_LIST_DIR}/../web/version.js.in"
  "${CMAKE_CURRENT_LIST_DIR}/../web/version.js"
  @ONLY)

set(WEB_PACKAGE_METADATA "${CMAKE_CURRENT_LIST_DIR}/../web/package.json.in")
set(WEB_DEPENDENCIES_MANIFEST "${CMAKE_CURRENT_LIST_DIR}/../external/DataFedDependencies/web/package.json")
set(WEB_PACKAGE_GENERATOR "${CMAKE_CURRENT_LIST_DIR}/../scripts/generate_web_package.cjs")
if(NOT EXISTS "${WEB_DEPENDENCIES_MANIFEST}")
  message(FATAL_ERROR "Missing web dependency manifest: ${WEB_DEPENDENCIES_MANIFEST}. Initialize the DataFedDependencies submodule.")
endif()

# Also support cmake -P: only Node and these manifest inputs are needed.
if(NOT DATAFED_WEB_NODE_EXECUTABLE)
  if(EXISTS "${DEPENDENCY_INSTALL_PATH}/nvm/versions/node/${LOCAL_NODE_VERSION}/bin/node")
    set(DATAFED_WEB_NODE_EXECUTABLE "${DEPENDENCY_INSTALL_PATH}/nvm/versions/node/${LOCAL_NODE_VERSION}/bin/node")
  else()
    find_program(DATAFED_WEB_NODE_EXECUTABLE NAMES node)
  endif()
endif()
if(NOT DATAFED_WEB_NODE_EXECUTABLE)
  message(FATAL_ERROR "Node is required to generate the web package manifest. Install the web dependencies or set DATAFED_WEB_NODE_EXECUTABLE.")
endif()

file(READ "${WEB_PACKAGE_METADATA}" WEB_PACKAGE_METADATA_TEMPLATE)
string(CONFIGURE "${WEB_PACKAGE_METADATA_TEMPLATE}" WEB_PACKAGE_METADATA_JSON @ONLY)
execute_process(
  COMMAND "${DATAFED_WEB_NODE_EXECUTABLE}" "${WEB_PACKAGE_GENERATOR}"
    "${WEB_PACKAGE_METADATA_JSON}" "${WEB_DEPENDENCIES_MANIFEST}"
    "${CMAKE_CURRENT_LIST_DIR}/../web/package.json"
  RESULT_VARIABLE WEB_PACKAGE_RESULT
  ERROR_VARIABLE WEB_PACKAGE_ERROR)
if(NOT "${WEB_PACKAGE_RESULT}" STREQUAL "0")
  message(FATAL_ERROR "Unable to generate web/package.json: ${WEB_PACKAGE_ERROR}")
endif()

if(NOT CMAKE_SCRIPT_MODE_FILE)
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    "${WEB_PACKAGE_METADATA}" "${WEB_DEPENDENCIES_MANIFEST}" "${WEB_PACKAGE_GENERATOR}")
endif()
