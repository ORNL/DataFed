cmake_minimum_required (VERSION 3.0.0)

# Copy README file to python build dir
configure_file( ${CMAKE_CURRENT_SOURCE_DIR}/README ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/datafed/VERSION.py.in"
  "${CMAKE_CURRENT_BINARY_DIR}/datafed/VERSION.py"
  @ONLY)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/datafed/API_VERSION.py.in"
  "${CMAKE_CURRENT_BINARY_DIR}/datafed/API_VERSION.py"
  @ONLY)
configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/datafed/RELEASE_VERSION.py.in"
  "${CMAKE_CURRENT_BINARY_DIR}/datafed/RELEASE_VERSION.py"
  @ONLY)

# Copy package files to build dir
file( GLOB PkgFiles ${CMAKE_CURRENT_SOURCE_DIR}/*.py )
foreach(file ${PkgFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )
endforeach()

# Make scripts build dir
file(MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/scripts)

# Copy scripts to build dir
file( GLOB ScriptFiles ${CMAKE_CURRENT_SOURCE_DIR}/scripts/* )
foreach(file ${ScriptFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR}/scripts COPYONLY )
endforeach()

add_subdirectory( datafed )

#add_custom_target( pydatafed_ver )
#add_dependencies( pydatafed_ver pydatafed_src )

#add_custom_command( TARGET pydatafed_ver POST_BUILD
#    COMMAND python3 make_ver.py )

add_custom_target( pydatafed )
add_dependencies( pydatafed pydatafed_src) # pydatafed_ver )
