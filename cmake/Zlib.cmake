
function(find_zlib_library)
  # Find zlib
  if(EXISTS ${DEPENDENCY_INSTALL_PATH})
    if(EXISTS ${DEPENDENCY_INSTALL_PATH}/include)
      set(ZLIB_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include" )
      include_directories(${ZLIB_INCLUDE_DIR})
    endif()
    if(EXISTS ${DEPENDENCY_INSTALL_PATH}/lib/libz.a)
      set(ZLIB_LIBRARIES "${DEPENDENCY_INSTALL_PATH}/lib/libz.a" )
    endif()
  endif()

  if(NOT EXISTS ${ZLIB_LIBRARIES})
    SET(CMAKE_FIND_LIBRARY_SUFFIXES ".a")
    find_package(ZLIB REQUIRED)
  endif()

  set(ZLIB_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include" )

  set(version_file "${CMAKE_CURRENT_LIST_DIR}/zlib_version")
  if(EXISTS "${version_file}")
    file(REMOVE "${version_file}")
  endif()

  # Keep the two processes separate, cmake seems to want to run them in parallel
  # for some reason if they are in the same execute_process call.
  execute_process(
    COMMAND ${CMAKE_CXX_COMPILER} -o ${version_file} "${version_file}.cpp" ${ZLIB_LIBRARIES} 
  )
  execute_process(
    COMMAND ${version_file}
    OUTPUT_VARIABLE ZLIB_VERSION_OUTPUT
    ERROR_VARIABLE ZLIB_VERSION_ERROR
    RESULT_VARIABLE ZLIB_VERSION_RESULT
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_STRIP_TRAILING_WHITESPACE
  )

  # Note parent scoped variables are not defined locally they only exist in
  # the parent script.
  set(DATAFED_ZLIB_VERSION_ACTUAL "${ZLIB_VERSION_OUTPUT}" PARENT_SCOPE)
  set(DATAFED_ZLIB_INCLUDE_DIR "${ZLIB_INCLUDE_DIR}" PARENT_SCOPE)
  set(DATAFED_ZLIB_LIBRARIES "${ZLIB_LIBRARIES}" PARENT_SCOPE)

endfunction()

find_zlib_library()
