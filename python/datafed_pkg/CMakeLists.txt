cmake_minimum_required (VERSION 3.17.0)
	message("Protobuf libraries in unit test: ${Protobuf_LIBRARIES}")

# Copy README file to python build dir
configure_file( ${CMAKE_CURRENT_SOURCE_DIR}/README ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )

# The files should exist in both the source and binary directories, they are needed in the 
# source directory to run the tests and in the binary directory to install the package
configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/datafed/VERSION.py.in"
  "${CMAKE_CURRENT_BINARY_DIR}/datafed/VERSION.py"
  @ONLY)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/datafed/VERSION.py.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/datafed/VERSION.py"
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

add_custom_target( pydatafed )
add_dependencies( pydatafed pydatafed_src)
