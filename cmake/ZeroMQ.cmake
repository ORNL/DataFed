function(find_zeromq_library)
  set(ZEROMQ_INCLUDE_DIR "" )
  set(ZEROMQ_LIB_DIR "" )
  set(ZEROMQ_LIB_CMAKE_DIR "" )
  set(ZEROMQ_LIBRARY_PATH "" )

  if(EXISTS ${DEPENDENCY_INSTALL_PATH}/lib/cmake)
    set(ZEROMQ_LIB_CMAKE_DIR "${DEPENDENCY_INSTALL_PATH}/lib/cmake")
  endif()
  if(EXISTS ${DEPENDENCY_INSTALL_PATH}/include)
    set(ZEROMQ_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include")
  endif()
  if(EXISTS ${DEPENDENCY_INSTALL_PATH}/lib)
    set(ZEROMQ_LIB_DIR "${DEPENDENCY_INSTALL_PATH}/lib")
  endif()

  find_package(ZeroMQ REQUIRED CONFIG PATHS "${ZEROMQ_LIB_CMAKE_DIR}")

  get_target_property(ZEROMQ_LIBRARY_PATH libzmq-static LOCATION)
  get_target_property(ZEROMQ_DEPENDENCIES libzmq-static INTERFACE_LINK_LIBRARIES)

  if(NOT "${LIBZMQ_VERSION}" STREQUAL "${ZeroMQ_VERSION}")
    message(FATAL_ERROR "Required ZeroMQ version ${LIBZMQ_VERSION}, not satisfied. Found version ${ZeroMQ_VERSION}")
  endif()

  string(REPLACE ";" "\n" DEP_LIST "${ZEROMQ_DEPENDENCIES}")
  string(REGEX REPLACE "\n+" ";" DEP_LIST "${DEP_LIST}")
  # Iterate through the list
  foreach(item IN LISTS DEP_LIST)
    # Search for the pattern in each item
    string(FIND ${item} "sodium" pattern_index)
    # If the pattern is found
    if(NOT ${pattern_index} EQUAL -1)
      set(ZEROMQ_SODIUM_LIBRARY_PATH "${item}")
    endif()
  endforeach()

  set(version_file "${CMAKE_CURRENT_LIST_DIR}/sodium_version")
  if(EXISTS "${version_file}")
    file(REMOVE "${version_file}")
  endif()

  # Keep the two processes separate, cmake seems to want to run them in parallel
  # for some reason if they are in the same execute_process call.
  execute_process(
    COMMAND ${CMAKE_CXX_COMPILER} -o ${version_file}
    "${version_file}.cpp" ${ZEROMQ_SODIUM_LIBRARY_PATH} -I${ZEROMQ_INCLUDE_DIR}
    OUTPUT_VARIABLE SODIUM_BUILD_VERSION_OUTPUT
    ERROR_VARIABLE SODIUM_BUILD_VERSION_ERROR
    RESULT_VARIABLE SODIUM_BUILD_VERSION_RESULT
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_STRIP_TRAILING_WHITESPACE
  )

  # NOTE if the build was success the return code should be 0.
  if(NOT ${SODIUM_BUILD_VERSION_RESULT} EQUAL 0 )
    message(FATAL_ERROR "Unable to build with provided ZeroMQ sodium library:
    ${ZEROMQ_SODIUM_LIBRARY_PATH} . Compiling test code fails.
    ${SODIUM_BUILD_VERSION_ERROR}
    ")
  endif()

  execute_process(
    COMMAND ${version_file}
    OUTPUT_VARIABLE SODIUM_VERSION_OUTPUT
    ERROR_VARIABLE SODIUM_VERSION_ERROR
    RESULT_VARIABLE SODIUM_VERSION_RESULT
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_STRIP_TRAILING_WHITESPACE
  )

  set(DATAFED_ZEROMQ_INCLUDE_DIR "${ZEROMQ_INCLUDE_DIR}" PARENT_SCOPE)
  set(DATAFED_ZEROMQ_LIB_DIR "${ZEROMQ_LIB_DIR}"  PARENT_SCOPE)
  set(DATAFED_ZEROMQ_LIB_CMAKE_DIR "${ZEROMQ_LIB_CMAKE_DIR}"  PARENT_SCOPE)
  set(DATAFED_ZEROMQ_LIBRARY_PATH "${ZEROMQ_LIBRARY_PATH}"  PARENT_SCOPE)
  set(DATAFED_ZEROMQ_DEPENDENCEIS "${ZEROMQ_DEPENDENCIES}" PARENT_SCOPE)
  set(DATAFED_ZEROMQ_SODIUM_LIBRARY_PATH "${ZEROMQ_SODIUM_LIBRARY_PATH}" PARENT_SCOPE)
  set(DATAFED_ZEROMQ_SODIUM_VERSION "${SODIUM_VERSION_OUTPUT}" PARENT_SCOPE)
  set(DATAFED_ZEROMQ_VERSION_ACTUAL "${ZeroMQ_VERSION}" PARENT_SCOPE)
endfunction()

find_zeromq_library()
