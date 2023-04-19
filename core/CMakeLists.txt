cmake_minimum_required (VERSION 3.0.0)

include_directories(${CMAKE_BINARY_DIR}/common/include)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/database/foxx/api/version_router.js.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/database/foxx/api/version_router.js"
  @ONLY)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/database/foxx/manifest.json.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/database/foxx/manifest.json"
  @ONLY)

add_subdirectory (server)

