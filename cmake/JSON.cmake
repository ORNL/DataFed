
function(find_json_library)

  set(JSON_INCLUDE_DIR "" )
  set(JSON_LIB_DIR "" )
  set(JSON_LIB_CMAKE_DIR "" )
  set(JSON_LIBRARY_PATH "" )

  if(EXISTS ${DEPENDENCY_INSTALL_PATH})
    set(JSON_LIB_CMAKE_DIR "${DEPENDENCY_INSTALL_PATH}/share/cmake ${DEPENDENCY_INSTALL_PATH}/lib/cmake")
    set(JSON_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include")
    set(JSON_LIB_DIR "${DEPENDENCY_INSTALL_PATH}/lib")
  endif()


  find_package(nlohmann_json CONFIG REQUIRED PATHS "${JSON_LIB_CMAKE_DIR}")

  # NOTE interfaces do not have a physical location associated with the library
  get_target_property(JSON_INCLUDE_PATH nlohmann_json::nlohmann_json INTERFACE_INCLUDE_DIRECTORIES )

  set(DATAFED_JSON_INCLUDE_PATH "${JSON_INCLUDE_PATH}" PARENT_SCOPE)
  set(DATAFED_JSON_VERSION_ACTUAL "${nlohmann_json_VERSION}" PARENT_SCOPE)
endfunction()

find_json_library()
