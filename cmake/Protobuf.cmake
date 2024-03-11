
function(find_protobuf_library)
  set(PROTOBUF_INCLUDE_DIR "" )
  set(PROTOBUF_LIB_DIR "" )
  set(PROTOBUF_LIB_CMAKE_DIR "" )
  set(PROTOBUF_LIBRARY_PATH "" )
  set(PROTOC_LIBRARY_PATH "" )
  set(PROTOC_EXECUTABLE_PATH "" )

  if(EXISTS ${DEPENDENCY_INSTALL_PATH})
    set(PROTOBUF_LIB_CMAKE_DIR "${DEPENDENCY_INSTALL_PATH}/lib/cmake")
    set(PROTOBUF_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include")
    set(PROTOBUF_LIB_DIR "${DEPENDENCY_INSTALL_PATH}/lib")
  endif()

  find_package(Protobuf REQUIRED CONFIG ${PROTOBUF_LIBRARY_VERSION} PATHS "${PROTOBUF_LIB_CMAKE_DIR}" COMPONENTS libprotobuf libprotoc)

  # This is necessary because they decided to increment the protoc tool starting
  # with the minor version number but kept the library incrementing with a major
  # version cmake fails with using find_package with a REQUIRED statement
  # because looks at both of these numbers which are different so here
  # we compare the version of protoc differently from the library
  if(NOT ${Protobuf_VERSION} STREQUAL ${PROTOBUF_LIBRARY_VERSION} )
    message(FATAL_ERROR "Versions of proto library (${Protobuf_VERSION}) and the required version (${PROTOBUF_LIBRARY_VERSION}) do not match.")
  endif()

  get_target_property(PROTOBUF_LIBRARY_PATH protobuf::libprotobuf IMPORTED_LOCATION_NOCONFIG)
  get_target_property(PROTOC_LIBRARY_PATH protobuf::libprotoc IMPORTED_LOCATION_NOCONFIG)
  get_target_property(PROTOC_EXECUTABLE_PATH protobuf::protoc IMPORTED_LOCATION_NOCONFIG)

  include_directories("${PROTOBUF_INCLUDE_DIR}")
  get_target_property(PROTOC_PATH protobuf::protoc IMPORTED_LOCATION_NOCONFIG)

  set(ENV{LD_LIBRARY_PATH} "${PROTOBUF_LIB_DIR}:$ENV{LD_LIBRARY_PATH}")
  execute_process(
    COMMAND ${PROTOC_PATH} --version
    OUTPUT_VARIABLE PROTOBUF_COMPILER_VERSION_OUTPUT
    ERROR_VARIABLE PROTOBUF_VERSION_ERROR
    RESULT_VARIABLE PROTOBUF_VERSION_RESULT
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_STRIP_TRAILING_WHITESPACE
    )

  # Remove library name from output
  # Regular expression to match the first word
  set(regex "^[^ ]+ ")

  # Remove the first word using string(REGEX REPLACE ...)
  string(REGEX REPLACE "${regex}" "" PROTOBUF_COMPILER_VERSION_ACTUAL "${PROTOBUF_COMPILER_VERSION_OUTPUT}")

  if(NOT ${PROTOBUF_COMPILER_VERSION_ACTUAL} STREQUAL ${PROTOBUF_COMPILER_VERSION} )
    message(FATAL_ERROR "Versions of protoc compiler (${PROTOBUF_COMPILER_VERSION_ACTUAL}) and the required version (${PROTOBUF_COMPILER_VERSION}) do not match.")
  endif()

  set( PROTOBUF_IMPORT_DIRS ${PROTOBUF_INCLUDE_DIRS})

  set(DATAFED_PROTOBUF_INCLUDE_DIR "${PROTOBUF_INCLUDE_DIR}" PARENT_SCOPE)
  set(DATAFED_PROTOBUF_LIB_DIR "${PROTOBUF_LIB_DIR}" PARENT_SCOPE)
  set(DATAFED_PROTOBUF_LIB_CMAKE_DIR "${PROTOBUF_LIB_CMAKE_DIR}" PARENT_SCOPE)
  set(DATAFED_PROTOBUF_LIBRARY_PATH "${PROTOBUF_LIBRARY_PATH}" PARENT_SCOPE)
  set(DATAFED_PROTOBUF_INCLUDE_PATH "${PROTOBUF_INCLUDE_DIR}" PARENT_SCOPE)
  set(DATAFED_PROTOC_LIBRARY_PATH "${PROTOC_LIBRARY_PATH}" PARENT_SCOPE)
  set(DATAFED_PROTOC_EXECUTABLE_PATH "${PROTOC_EXECUTABLE_PATH}" PARENT_SCOPE)
  set(DATAFED_PROTOBUF_COMPILER_VERSION_ACTUAL "${PROTOBUF_COMPILER_VERSION_ACTUAL}" PARENT_SCOPE)

  set(DATAFED_PROTOBUF_VERSION_ACTUAL "${Protobuf_VERSION}" PARENT_SCOPE)
endfunction()

find_protobuf_library()
