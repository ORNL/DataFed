function(find_json_schema_library)

  set(JSON_SCHEMA_INCLUDE_DIR "" )
  set(JSON_SCHEMA_LIB_DIR "" )
  set(JSON_SCHEMA_LIB_CMAKE_DIR "" )
  set(JSON_SCHEMA_LIBRARY_PATH "" )
  
  if(EXISTS ${DEPENDENCY_INSTALL_PATH})
    set(JSON_SCHEMA_LIB_CMAKE_DIR "${DEPENDENCY_INSTALL_PATH}/lib/cmake")
    set(JSON_SCHEMA_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include")
    set(JSON_SCHEMA_LIB_DIR "${DEPENDENCY_INSTALL_PATH}/lib")
  endif()
    # Specifying the VERSION with find_package commands since updating the json schema version from
    # version "2.1.0" to "2.3.0" is no longer supported.
  find_package(nlohmann_json_schema_validator REQUIRED  PATHS "${JSON_SCHEMA_LIB_CMAKE_DIR}")

  # NOTE interfaces do not have a physical location associated with the library
  get_target_property(JSON_SCHEMA_INCLUDE_PATH nlohmann_json_schema_validator::validator INTERFACE_INCLUDE_DIRECTORIES)
  get_target_property(JSON_SCHEMA_LIBRARY_PATH nlohmann_json_schema_validator::validator LOCATION)

  if(NOT "${JSON_SCHEMA_VALIDATOR_VERSION}" STREQUAL "${nlohmann_json_schema_validator_VERSION}")
    message(FATAL_ERROR "REQUIRED Nlohmann JSON Schema Validator version ${JSON_SCHEMA_VALIDATOR_VERSION}, not satisfied. Found version ${nlohmann_json_schema_validator_VERSION}")
  endif()

  set(DATAFED_JSON_SCHEMA_INCLUDE_PATH "${JSON_SCHEMA_INCLUDE_PATH}" PARENT_SCOPE)
  set(DATAFED_JSON_SCHEMA_LIBRARY_PATH "${JSON_SCHEMA_LIBRARY_PATH}" PARENT_SCOPE)
  set(DATAFED_JSON_SCHEMA_VERSION_ACTUAL "${nlohmann_json_schema_validator_VERSION}" PARENT_SCOPE)

endfunction()

find_json_schema_library()
