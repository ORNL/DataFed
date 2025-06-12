
function(find_globus_common_library)

  find_library(GLOBUS_COMMON_LIBRARIES globus_common)

  if(NOT GLOBUS_COMMON_LIBRARIES)
    set(GLOBUS_COMMON_LIBRARIES "")
  endif()

  set(DATAFED_GLOBUS_COMMON_LIBRARIES "${GLOBUS_COMMON_LIBRARIES}" PARENT_SCOPE)

endfunction()

find_globus_common_library()
