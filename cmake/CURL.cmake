function(find_curl_library)

  set(CURL_SSH_LIBRARY "")

  if(EXISTS ${DEPENDENCY_INSTALL_PATH})
    if(EXISTS ${DEPENDENCY_INSTALL_PATH}/include)
      set(CURL_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include" )
      include_directories(${CURL_INCLUDE_DIR})
    endif()
    if(EXISTS ${DEPENDENCY_INSTALL_PATH}/lib/libcurl.a)
      set(CURL_LIBRARIES "${DEPENDENCY_INSTALL_PATH}/lib/libcurl.a" )
    endif()
  endif()

  if(NOT EXISTS ${CURL_LIBRARIES})

    if(BUILD_SHARED_LIBS)
      SET(CMAKE_FIND_LIBRARY_SUFFIXES ".so")
      set(CURL_USE_STATIC_LIBS FALSE)
    else()
      SET(CMAKE_FIND_LIBRARY_SUFFIXES ".a")
      set(CURL_USE_STATIC_LIBS TRUE)
  endif()
    find_package(CURL REQUIRED )

    # NOTE - depending on what libraries the system curl library was built with
    # it may be very difficult to link all the other third party libraries
    if(CURL_FOUND)
      include_directories(${CURL_INCLUDE_DIR})

      # Sometimes curl is built with support for ssh, we will go ahead and see
      # if we can locat the ssh library
      get_filename_component(FOLDER_WHERE_CURL_LIB_FOUND ${CURL_LIBRARIES} DIRECTORY)

      find_library(SSH_LIBRARY_FOUND
        NAMES libssh libssh.a libssh.so libssh.so.*
        PATHS /lib /usr/lib /usr/local/lib ${FOLDER_WHERE_CURL_LIB_FOUND})

      if(SSH_LIBRARY_FOUND)
        set(CURL_SSH_LIBRARY ${SSH_LIBRARY_FOUND})
      endif()

    endif()

  endif()

  set(version_file "${CMAKE_CURRENT_LIST_DIR}/curl_version")
  if(EXISTS "${version_file}")
    file(REMOVE "${version_file}")
  endif()

  # Keep the two processes separate, cmake seems to want to run them in parallel
  # for some reason if they are in the same execute_process call.
  execute_process(
    COMMAND ${CMAKE_CXX_COMPILER} -o ${version_file} "${version_file}.cpp"
    ${CURL_LIBRARIES} ${OPENSSL_SSL_LIBRARY} ${OPENSSL_CRYPTO_LIBRARY}
    ${DATAFED_ZLIB_LIBRARIES} ${CURL_SSH_LIBRARY} -I${CURL_INCLUDE_DIR}
    -lpthread  -ldl
    OUTPUT_VARIABLE CURL_BUILD_VERSION_OUTPUT
    ERROR_VARIABLE CURL_BUILD_VERSION_ERROR
    RESULT_VARIABLE CURL_BUILD_VERSION_RESULT
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_STRIP_TRAILING_WHITESPACE
  )

  # NOTE if the build was success the return code should be 0.
  if(NOT ${CURL_BUILD_VERSION_RESULT} EQUAL 0 )
    message(FATAL_ERROR "Unable to build with provided curl ssl and crypto libraries:
    CURL_LIBRARIES: ${CURL_LIBRARIES} 
    OPENSSL_SSL_LIBRARY: ${OPENSSL_SSL_LIBRARY}
    OPENSSL_CRYPTO_LIBRARY: ${OPENSSL_CRYPTO_LIBRARY}
    Compiling test code fails.\n
    NOTE - it is possible that curl was built with some other libraries that
    have not been found. i.e.
    ${CURL_SSH_LIBRARY}
    \n
    ERROR message is \n${CURL_BUILD_VERSION_ERROR}\n")
  endif()


  execute_process(
    COMMAND ${version_file}
    OUTPUT_VARIABLE CURL_VERSION_OUTPUT
    ERROR_VARIABLE CURL_VERSION_ERROR
    RESULT_VARIABLE CURL_VERSION_RESULT
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_STRIP_TRAILING_WHITESPACE
  )

  # Note parent scoped variables are not defined locally they only exist in
  # the parent script.
  set(DATAFED_CURL_VERSION_ACTUAL "${CURL_VERSION_OUTPUT}" PARENT_SCOPE)
  set(DATAFED_CURL_INCLUDE_DIR "${CURL_INCLUDE_DIR}" PARENT_SCOPE)
  set(DATAFED_CURL_LIBRARIES "${CURL_LIBRARIES}" PARENT_SCOPE)

endfunction()

find_curl_library()
