function(find_libcurl_library)

  set(CURL_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include" PARENT_SCOPE)
  set(CURL_LIBRARIES "${DEPENDENCY_INSTALL_PATH}/lib/libcurl.a" PARENT_SCOPE)

endfunction()

find_libcurl_library()
