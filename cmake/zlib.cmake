function(find_zlib_library)

  set(ZLIB_INCLUDE_DIR "${DEPENDENCY_INSTALL_PATH}/include" PARENT_SCOPE)
  set(ZLIB_LIBRARIES "${DEPENDENCY_INSTALL_PATH}/lib/libz.a" PARENT_SCOPE)

endfunction()

find_zlib_library()
