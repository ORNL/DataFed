
function(find_zlib_library)
  # Find zlib
  set(ZLIB_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include" )
  set(ZLIB_LIBRARIES "${DEPENDENCY_INSTALL_PATH}/lib/libz.a" )

  message("${CMAKE_CXX_COMPILER} -o ${CMAKE_CURRENT_LIST_DIR}/zlib_version ${CMAKE_CURRENT_LIST_DIR}/zlib_version.cpp ${ZLIB_LIBRARIES}")

  set(version_file "${CMAKE_CURRENT_LIST_DIR}/zlib_version")
  if(EXISTS "${version_file}")
    file(REMOVE "${version_file}")
  endif()

  execute_process(
    COMMAND ${CMAKE_CXX_COMPILER} -o ${version_file} ${version_file}.cpp ${ZLIB_LIBRARIES} 
    COMMAND ${CMAKE_CURRENT_LIST_DIR}/zlib_version
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
