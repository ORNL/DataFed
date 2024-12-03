
function(find_gssapi_library)

  find_library(GSSAPI_LIBRARIES NAMES libgssapi.so.3 libgssapi.so gssapi gssapi )

  if(NOT GSSAPI_LIBRARIES)
    set(GSSAPI_LIBRARIES "")
  endif()

  set(DATAFED_GSSAPI_LIBRARIES "${GSSAPI_LIBRARIES}" PARENT_SCOPE)

endfunction()

find_gssapi_library()
