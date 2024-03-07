cmake_minimum_required (VERSION 3.17.0)

# DataFed Version numbers need to be defined before running configure scripts
include (${CMAKE_CURRENT_LIST_DIR}/Version.cmake)

# Prepare web files
# This script can be run as part of the cmake include process or as it's own
# script
configure_file(
  "${CMAKE_CURRENT_LIST_DIR}/../web/version.js.in"
  "${CMAKE_CURRENT_LIST_DIR}/../web/version.js"
  @ONLY)

configure_file(
  "${CMAKE_CURRENT_LIST_DIR}/../web/package.json.in"
  "${CMAKE_CURRENT_LIST_DIR}/../web/package.json"
  @ONLY)


